import zlib from 'node:zlib';

import env from '../../config/env.js';
import { decodeBase64, decrypt } from '../../lib/crypto/encryption.js';
import type { AppOpenAPI } from '../../types/index.js';
import prisma from '../../utils/context.js';

import { logger } from '../../lib/logging.js';
import {
  publishUpdatedClasses,
  publishUpdatedCompetitorsById,
} from '../competitor/competitor-change.service.js';
import { notifyWinnerChanges } from '../event/event.winner-cache.service.js';
import {
  ImportSourceType,
  computeRawHash,
  findImportStateByHash,
  recordSkippedImport,
  upsertImportState,
} from '../upload/upload.import-state.js';
import { parseMopDocument } from './meos.parser.js';
import { processMopDocument } from './meos.service.js';

const MOP_RESPONSE = {
  OK: '<?xml version="1.0"?><MOPStatus status="OK"></MOPStatus>',
  BADCMP: '<?xml version="1.0"?><MOPStatus status="BADCMP"></MOPStatus>',
  BADPWD: '<?xml version="1.0"?><MOPStatus status="BADPWD"></MOPStatus>',
  NOZIP: '<?xml version="1.0"?><MOPStatus status="NOZIP"></MOPStatus>',
  ERROR: '<?xml version="1.0"?><MOPStatus status="ERROR"></MOPStatus>',
} as const;

const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_COMPRESSION_STORE = 0;
const ZIP_COMPRESSION_DEFLATE = 8;

function mopXml(status: keyof typeof MOP_RESPONSE): Response {
  return new Response(MOP_RESPONSE[status], {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function isZipPayload(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  );
}

function findZipEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function findZipCentralDirectory(buffer: Buffer, startOffset: number): number {
  for (let offset = Math.max(0, startOffset); offset <= buffer.length - 4; offset++) {
    if (buffer.readUInt32LE(offset) === ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
}

function extractMopXmlFromZip(buffer: Buffer): string {
  const endOffset = findZipEndOfCentralDirectory(buffer);
  if (endOffset === -1) {
    return extractMopXmlFromLocalZipEntry(buffer);
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(endOffset + 16);
  let offset = centralDirectoryOffset;
  let fallbackEntry: { localHeaderOffset: number; compressedSize: number; method: number } | null =
    null;

  for (let i = 0; i < entryCount; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error('Invalid ZIP central directory');
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    if (fileNameEnd > buffer.length) {
      throw new Error('Invalid ZIP file name');
    }

    const fileName = buffer.subarray(fileNameStart, fileNameEnd).toString('utf8');
    const isDirectory = fileName.endsWith('/');
    const isSupportedMethod =
      method === ZIP_COMPRESSION_STORE || method === ZIP_COMPRESSION_DEFLATE;

    if (!isDirectory && isSupportedMethod) {
      if (uncompressedSize > env.MAX_UPLOAD_BODY_SIZE_BYTES) {
        throw new Error('ZIP entry is too large after decompression');
      }

      const entry = { localHeaderOffset, compressedSize, method };
      if (/\.xml$/i.test(fileName)) {
        return extractZipEntry(buffer, entry);
      }

      fallbackEntry ??= entry;
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  if (!fallbackEntry) {
    throw new Error('No supported file entry found in ZIP payload');
  }

  return extractZipEntry(buffer, fallbackEntry);
}

function extractMopXmlFromLocalZipEntry(buffer: Buffer): string {
  if (buffer.length < 30 || buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error('ZIP end of central directory not found');
  }

  const method = buffer.readUInt16LE(8);
  const compressedSize = buffer.readUInt32LE(18);
  const uncompressedSize = buffer.readUInt32LE(22);

  if (method !== ZIP_COMPRESSION_STORE && method !== ZIP_COMPRESSION_DEFLATE) {
    throw new Error('Unsupported ZIP compression method');
  }

  if (uncompressedSize > env.MAX_UPLOAD_BODY_SIZE_BYTES) {
    throw new Error('ZIP entry is too large after decompression');
  }

  return extractZipEntry(buffer, {
    localHeaderOffset: 0,
    compressedSize,
    method,
    allowUnknownCompressedSize: true,
  });
}

function extractZipEntry(
  buffer: Buffer,
  entry: {
    localHeaderOffset: number;
    compressedSize: number;
    method: number;
    allowUnknownCompressedSize?: boolean;
  },
): string {
  const { localHeaderOffset, compressedSize, method, allowUnknownCompressedSize = false } = entry;

  if (
    localHeaderOffset + 30 > buffer.length ||
    buffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE
  ) {
    throw new Error('Invalid ZIP local file header');
  }

  const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
  let dataEnd = dataStart + compressedSize;

  if (allowUnknownCompressedSize && compressedSize === 0) {
    const centralDirectoryOffset = findZipCentralDirectory(buffer, dataStart);
    if (centralDirectoryOffset !== -1) {
      dataEnd = centralDirectoryOffset;
    } else if (method === ZIP_COMPRESSION_DEFLATE) {
      dataEnd = buffer.length;
    }
  }

  if (dataStart > buffer.length || dataEnd > buffer.length || dataEnd <= dataStart) {
    throw new Error('Invalid ZIP entry size');
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  const xmlBuffer = method === ZIP_COMPRESSION_STORE ? compressed : zlib.inflateRawSync(compressed);

  if (xmlBuffer.length > env.MAX_UPLOAD_BODY_SIZE_BYTES) {
    throw new Error('ZIP entry is too large after decompression');
  }

  return xmlBuffer.toString('utf8');
}

export function registerMeosHandler(router: AppOpenAPI): void {
  router.post('/meos', async (c) => {
    const rawBuffer = Buffer.from(await c.req.arrayBuffer());
    const payloadSizeBytes = rawBuffer.length;

    let xmlBody: string;
    if (isZipPayload(rawBuffer)) {
      try {
        xmlBody = extractMopXmlFromZip(rawBuffer);
      } catch (err) {
        logger.error('MeOS MOP upload: ZIP payload extraction failed', {
          payloadSizeBytes,
          error: err instanceof Error ? err.message : String(err),
        });
        return mopXml('ERROR');
      }
    } else {
      xmlBody = rawBuffer.toString('utf8');
    }

    // competition header
    const competitionHeader = c.req.header('competition');
    if (!competitionHeader) {
      logger.warn('MeOS MOP upload: missing competition header');
      return mopXml('BADCMP');
    }
    const meosCompetitionId = parseInt(competitionHeader, 10);
    if (!Number.isInteger(meosCompetitionId) || meosCompetitionId <= 0) {
      logger.warn('MeOS MOP upload: invalid competition header', { competitionHeader });
      return mopXml('BADCMP');
    }

    // Binding lookup — the competition header value is the binding's PK
    const binding = await prisma.eventMeosBinding.findFirst({
      where: { id: meosCompetitionId, event: { published: true } },
      select: {
        id: true,
        eventId: true,
        event: { select: { id: true, date: true, timezone: true, authorId: true } },
      },
    });
    if (!binding) {
      logger.warn('MeOS MOP upload: no active binding found', { meosCompetitionId });
      return mopXml('BADCMP');
    }

    const { eventId, event } = binding;

    // Password check
    const pwdHeader = c.req.header('pwd');
    const eventPassword = await prisma.eventPassword.findFirst({
      where: { eventId },
      select: { password: true, expiresAt: true },
    });
    if (!eventPassword || eventPassword.expiresAt <= new Date()) {
      logger.warn('MeOS MOP upload: missing or expired event password', {
        eventId,
        meosCompetitionId,
      });
      return mopXml('BADPWD');
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decrypt(decodeBase64(eventPassword.password));
    } catch {
      logger.error('MeOS MOP upload: password decryption failed', { eventId });
      return mopXml('ERROR');
    }
    if (pwdHeader !== decryptedPassword) {
      logger.warn('MeOS MOP upload: password mismatch', { eventId, meosCompetitionId });
      return mopXml('BADPWD');
    }

    // XML parse
    const doc = parseMopDocument(xmlBody);
    if (!doc) {
      logger.error('MeOS MOP upload: XML parse failed or unsupported root', {
        eventId,
        meosCompetitionId,
        payloadSizeBytes,
      });
      return mopXml('ERROR');
    }

    const rawHash = computeRawHash(rawBuffer);

    const isDuplicateSuccessfulImport = await findImportStateByHash(
      eventId,
      ImportSourceType.MEOS,
      doc.rootType,
      rawHash,
    );
    if (isDuplicateSuccessfulImport) {
      await recordSkippedImport(eventId, ImportSourceType.MEOS, doc.rootType, rawHash).catch(
        (err) => {
          logger.warn('MeOS MOP upload: failed to record skipped import', {
            eventId,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      );

      logger.info('MeOS MOP upload: skipped identical successful payload', {
        eventId,
        meosCompetitionId,
        rootElement: doc.rootType,
        payloadSizeBytes,
        rawHash,
      });
      return mopXml('OK');
    }

    // Process in transaction
    let processResult;
    try {
      if (event.authorId === null) {
        throw new Error('Event has no author for protocol records');
      }
      processResult = await processMopDocument(eventId, doc, {
        ...event,
        authorId: event.authorId,
      });
    } catch (err) {
      logger.error('MeOS MOP upload: processing error', {
        eventId,
        meosCompetitionId,
        rootElement: doc.rootType,
        error: err instanceof Error ? err.message : String(err),
      });
      return mopXml('ERROR');
    }

    if (processResult.updatedClassIds.length > 0) {
      await publishUpdatedCompetitorsById(
        eventId,
        processResult.updatedCompetitorIds,
        (competitorId, err) => {
          logger.error('MeOS MOP upload: failed to publish updated competitor', {
            eventId,
            meosCompetitionId,
            competitorId,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      );

      await publishUpdatedClasses(processResult.updatedClassIds, (classId, err) => {
        logger.error('MeOS MOP upload: failed to publish updated competitors by class', {
          eventId,
          meosCompetitionId,
          classId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await notifyWinnerChanges(eventId);
    }

    // Record import state
    try {
      await upsertImportState(eventId, ImportSourceType.MEOS, {
        payloadType: doc.rootType,
        rawHash,
        rootElement: doc.rootType,
      });
    } catch (err) {
      logger.warn('MeOS MOP upload: failed to upsert import state', {
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.info('MeOS MOP upload: success', {
      eventId,
      meosCompetitionId,
      rootElement: doc.rootType,
      payloadSizeBytes,
      updatedClassCount: processResult.updatedClassIds.length,
      updatedCompetitorCount: processResult.updatedCompetitorIds.length,
    });

    return mopXml('OK');
  });
}
