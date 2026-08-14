import { createHash } from 'node:crypto';

import { ImportSourceType } from '../../generated/prisma/enums.js';
import prisma from '../../utils/context.js';

export { ImportSourceType };

// Exporters re-stamp the root createTime on every export; drop it so unchanged
// re-exports hash the same. Non-global: the root attribute only, not payload.
const VOLATILE_ROOT_ATTR = /\screateTime="[^"]*"/;

export function computeRawHash(buffer: Buffer): string {
  // latin1 round-trips bytes 1:1, so the hash stays byte-exact even for binary
  // (zipped) payloads. utf8 would fold invalid bytes into U+FFFD and collide.
  return createHash('sha256')
    .update(buffer.toString('latin1').replace(VOLATILE_ROOT_ATTR, ''), 'latin1')
    .digest('hex');
}

export function detectXmlRootElement(xmlBuffer: Buffer): string | null {
  // Read only the first 2 KB — enough to find the root tag without loading the
  // whole document. The pattern skips <?xml ...?> because `?` is not [A-Za-z].
  const head = xmlBuffer.subarray(0, 2048).toString('utf8');
  const match = head.match(/<([A-Za-z][A-Za-z0-9_:.-]*)/);
  return match ? match[1] : null;
}

export async function findImportStateByHash(
  eventId: string,
  sourceType: ImportSourceType,
  payloadType: string,
  rawHash: string,
): Promise<boolean> {
  const existing = await prisma.eventImportState.findFirst({
    where: {
      eventId,
      sourceType,
      payloadType,
      rawHash,
      lastSuccessfulImportAt: { not: null },
    },
    select: { id: true },
  });
  return existing !== null;
}

export type ImportStateMeta = {
  payloadType: string;
  rawHash: string;
  creator?: string | null;
  externalCreateTime?: Date | null;
  formatVersion?: string | null;
  externalStatus?: string | null;
  rootElement?: string | null;
};

export async function upsertImportState(
  eventId: string,
  sourceType: ImportSourceType,
  meta: ImportStateMeta,
): Promise<void> {
  const now = new Date();
  await prisma.eventImportState.upsert({
    where: {
      eventId_sourceType_payloadType: {
        eventId,
        sourceType,
        payloadType: meta.payloadType,
      },
    },
    update: {
      rawHash: meta.rawHash,
      creator: meta.creator ?? null,
      externalCreateTime: meta.externalCreateTime ?? null,
      formatVersion: meta.formatVersion ?? null,
      externalStatus: meta.externalStatus ?? null,
      rootElement: meta.rootElement ?? null,
      lastSuccessfulImportAt: now,
      successCount: { increment: 1 },
    },
    create: {
      eventId,
      sourceType,
      payloadType: meta.payloadType,
      rawHash: meta.rawHash,
      creator: meta.creator ?? null,
      externalCreateTime: meta.externalCreateTime ?? null,
      formatVersion: meta.formatVersion ?? null,
      externalStatus: meta.externalStatus ?? null,
      rootElement: meta.rootElement ?? null,
      lastSuccessfulImportAt: now,
      successCount: 1,
      skippedCount: 0,
    },
  });
}

export async function recordSkippedImport(
  eventId: string,
  sourceType: ImportSourceType,
  payloadType: string,
  rawHash: string,
): Promise<void> {
  await prisma.eventImportState.updateMany({
    where: { eventId, sourceType, payloadType, rawHash },
    data: {
      lastSkippedAt: new Date(),
      skippedCount: { increment: 1 },
    },
  });
}
