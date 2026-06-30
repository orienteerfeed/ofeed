import { describe, it, expect, vi, beforeEach } from 'vitest';
import zlib from 'node:zlib';
import { ImportSourceType } from '../../../generated/prisma/enums.js';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any app imports
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => {
  const tx = {
    split: { deleteMany: vi.fn() },
    protocol: { deleteMany: vi.fn() },
    competitor: { deleteMany: vi.fn(), upsert: vi.fn() },
    team: { deleteMany: vi.fn(), upsert: vi.fn() },
    class: { deleteMany: vi.fn(), upsert: vi.fn() },
    organisation: { deleteMany: vi.fn(), upsert: vi.fn() },
  };
  return {
    eventMeosBinding: { findFirst: vi.fn() },
    eventPassword: { findFirst: vi.fn() },
    eventImportState: { findFirst: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
});

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));

vi.mock('../../../lib/crypto/encryption.js', () => ({
  decrypt: vi.fn((buf: Buffer) => buf.toString('utf8')),
  decodeBase64: vi.fn((s: string) => Buffer.from(s, 'base64')),
}));

vi.mock('../meos.service.js', async () => ({
  processMopDocument: vi.fn(),
}));

import { Hono } from 'hono';
import { registerMeosHandler } from '../meos.handlers.js';
import { processMopDocument } from '../meos.service.js';

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

function buildApp() {
  const app = new Hono();
  const subRouter = new Hono();
  registerMeosHandler(subRouter as never);
  app.route('/rest/v1/meos', subRouter);
  return app;
}

const COMPLETE_XML = `<?xml version="1.0"?><MOPComplete xmlns="http://www.melin.nu/mop"></MOPComplete>`;
const DIFF_XML = `<?xml version="1.0"?><MOPDiff xmlns="http://www.melin.nu/mop"></MOPDiff>`;

const BINDING = {
  id: 42,
  eventId: 'cltestevt',
  event: {
    id: 'cltestevt',
    date: new Date('2024-06-15T00:00:00.000Z'),
    timezone: 'Europe/Prague',
    authorId: 11,
  },
};

const ACTIVE_EVENT_PASSWORD = {
  password: Buffer.from('secret').toString('base64'),
  expiresAt: new Date('2999-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(null);
  mockPrisma.eventPassword.findFirst.mockResolvedValue(ACTIVE_EVENT_PASSWORD);
  mockPrisma.eventImportState.findFirst.mockResolvedValue(null);
  mockPrisma.eventImportState.upsert.mockResolvedValue({});
  mockPrisma.eventImportState.updateMany.mockResolvedValue({ count: 1 });
  (processMopDocument as ReturnType<typeof vi.fn>).mockResolvedValue({
    updatedClassIds: [],
    updatedCompetitorIds: [],
  });
});

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function createZipPayload(
  fileName: string,
  text: string,
  options: { useDataDescriptor?: boolean; omitEndOfCentralDirectory?: boolean } = {},
): ArrayBuffer {
  const fileNameBuffer = Buffer.from(fileName, 'utf8');
  const uncompressed = Buffer.from(text, 'utf8');
  const compressed = zlib.deflateRawSync(uncompressed);
  const flags = options.useDataDescriptor ? 0x08 : 0;
  const localHeader = Buffer.alloc(30);

  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(flags, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(0, 10);
  localHeader.writeUInt32LE(0, 14);
  localHeader.writeUInt32LE(options.useDataDescriptor ? 0 : compressed.length, 18);
  localHeader.writeUInt32LE(options.useDataDescriptor ? 0 : uncompressed.length, 22);
  localHeader.writeUInt16LE(fileNameBuffer.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const dataDescriptor = Buffer.alloc(options.useDataDescriptor ? 16 : 0);
  if (options.useDataDescriptor) {
    dataDescriptor.writeUInt32LE(0x08074b50, 0);
    dataDescriptor.writeUInt32LE(0, 4);
    dataDescriptor.writeUInt32LE(compressed.length, 8);
    dataDescriptor.writeUInt32LE(uncompressed.length, 12);
  }

  const localFile = Buffer.concat([localHeader, fileNameBuffer, compressed, dataDescriptor]);
  const centralDirectory = Buffer.alloc(46);

  centralDirectory.writeUInt32LE(0x02014b50, 0);
  centralDirectory.writeUInt16LE(20, 4);
  centralDirectory.writeUInt16LE(20, 6);
  centralDirectory.writeUInt16LE(flags, 8);
  centralDirectory.writeUInt16LE(8, 10);
  centralDirectory.writeUInt32LE(0, 12);
  centralDirectory.writeUInt32LE(0, 16);
  centralDirectory.writeUInt32LE(compressed.length, 20);
  centralDirectory.writeUInt32LE(uncompressed.length, 24);
  centralDirectory.writeUInt16LE(fileNameBuffer.length, 28);
  centralDirectory.writeUInt16LE(0, 30);
  centralDirectory.writeUInt16LE(0, 32);
  centralDirectory.writeUInt16LE(0, 34);
  centralDirectory.writeUInt16LE(0, 36);
  centralDirectory.writeUInt32LE(0, 38);
  centralDirectory.writeUInt32LE(0, 42);

  const centralDirectoryStart = localFile.length;
  const centralDirectoryFile = Buffer.concat([centralDirectory, fileNameBuffer]);
  const endOfCentralDirectory = Buffer.alloc(22);

  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(1, 8);
  endOfCentralDirectory.writeUInt16LE(1, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryFile.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryStart, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return bufferToArrayBuffer(
    Buffer.concat(
      options.omitEndOfCentralDirectory
        ? [localFile, centralDirectoryFile]
        : [localFile, centralDirectoryFile, endOfCentralDirectory],
    ),
  );
}

function post(app: Hono, body: string | ArrayBuffer, headers: Record<string, string> = {}) {
  return app.request('/rest/v1/meos/mop', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /rest/v1/meos/mop', () => {
  it('returns BADCMP when competition header is missing', async () => {
    const app = buildApp();
    const res = await post(app, COMPLETE_XML);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('status="BADCMP"');
    expect(res.headers.get('content-type')).toMatch(/text\/xml/);
  });

  it('returns BADCMP when competition header is not an integer', async () => {
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: 'abc' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADCMP"');
  });

  it('returns BADCMP when no binding found', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADCMP"');
  });

  it('looks up MeOS binding without requiring the event to be published', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="OK"');
    expect(mockPrisma.eventMeosBinding.findFirst).toHaveBeenCalledWith({
      where: { id: 42 },
      select: {
        id: true,
        eventId: true,
        event: { select: { id: true, date: true, timezone: true, authorId: true } },
      },
    });
  });

  it('returns OK for ZIP-compressed MOPComplete', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(app, createZipPayload('ix.xml', COMPLETE_XML), {
      competition: '42',
      pwd: 'secret',
      'Content-Type': 'application/zip',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="OK"');
    expect(processMopDocument).toHaveBeenCalledOnce();
  });

  it('returns OK for ZIP payloads that use a local data descriptor', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(
      app,
      createZipPayload('ix50CE.tmp', COMPLETE_XML, {
        useDataDescriptor: true,
        omitEndOfCentralDirectory: true,
      }),
      {
        competition: '42',
        pwd: 'secret',
        'Content-Type': 'application/zip',
      },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="OK"');
    expect(processMopDocument).toHaveBeenCalledOnce();
  });

  it('returns ERROR for invalid ZIP payloads', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(
      app,
      bufferToArrayBuffer(Buffer.from('PK\x03\x04some zip content', 'binary')),
      {
        competition: '42',
        'Content-Type': 'application/zip',
      },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="ERROR"');
  });

  it('returns ERROR for invalid XML', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(app, '<not valid xml<<', { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="ERROR"');
  });

  it('returns ERROR for unsupported root element', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(app, '<MOPStatus status="OK"></MOPStatus>', {
      competition: '42',
      pwd: 'secret',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="ERROR"');
  });

  it('returns BADPWD when pwd header is missing', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
    expect(processMopDocument).not.toHaveBeenCalled();
  });

  it('returns BADPWD when no active EventPassword is configured', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    mockPrisma.eventPassword.findFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
    expect(processMopDocument).not.toHaveBeenCalled();
  });

  it('skips processing when the same payload was already imported successfully', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    mockPrisma.eventImportState.findFirst.mockResolvedValue({ id: 1 });
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="OK"');
    expect(processMopDocument).not.toHaveBeenCalled();
    expect(mockPrisma.eventImportState.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.eventImportState.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: 'cltestevt',
        sourceType: ImportSourceType.MEOS,
        payloadType: 'MOPComplete',
        rawHash: expect.any(String),
      },
      data: expect.objectContaining({
        lastSkippedAt: expect.any(Date),
        skippedCount: { increment: 1 },
      }),
    });
  });

  it('returns OK for valid MOPDiff with correct password', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const app = buildApp();
    const res = await post(app, DIFF_XML, { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="OK"');
  });

  it('returns BADPWD when password configured and wrong pwd header', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    // Stored encrypted password decrypts to 'secret'
    const encryptedB64 = Buffer.from('secret').toString('base64');
    mockPrisma.eventPassword.findFirst.mockResolvedValue({
      password: encryptedB64,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'wrong' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
  });

  it('returns OK when correct password provided', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    const encryptedB64 = Buffer.from('secret').toString('base64');
    mockPrisma.eventPassword.findFirst.mockResolvedValue({
      password: encryptedB64,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="OK"');
  });

  it('returns BADPWD when EventPassword is expired', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    mockPrisma.eventPassword.findFirst.mockResolvedValue({
      password: Buffer.from('secret').toString('base64'),
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'wrong' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="BADPWD"');
    expect(processMopDocument).not.toHaveBeenCalled();
  });

  it('returns ERROR when processMopDocument throws', async () => {
    mockPrisma.eventMeosBinding.findFirst.mockResolvedValue(BINDING);
    (processMopDocument as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB error'));
    const app = buildApp();
    const res = await post(app, COMPLETE_XML, { competition: '42', pwd: 'secret' });

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('status="ERROR"');
  });
});
