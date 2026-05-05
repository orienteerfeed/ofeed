import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportSourceType } from '../../../generated/prisma/enums.js';
import {
  computeRawHash,
  detectXmlRootElement,
  findImportStateByHash,
  recordSkippedImport,
  upsertImportState,
} from '../upload.import-state.js';

const mockPrisma = vi.hoisted(() => ({
  eventImportState: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({ default: mockPrisma }));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// computeRawHash
// ---------------------------------------------------------------------------

describe('computeRawHash', () => {
  it('returns the SHA-256 hex digest of the buffer content', () => {
    const input = Buffer.from('hello');
    const expected = createHash('sha256').update(input).digest('hex');
    expect(computeRawHash(input)).toBe(expected);
  });

  it('returns the same hash for identical input on repeated calls', () => {
    const buf = Buffer.from('<ResultList/>');
    expect(computeRawHash(buf)).toBe(computeRawHash(buf));
  });

  it('returns different hashes for different content', () => {
    expect(computeRawHash(Buffer.from('aaa'))).not.toBe(computeRawHash(Buffer.from('bbb')));
  });
});

// ---------------------------------------------------------------------------
// detectXmlRootElement
// ---------------------------------------------------------------------------

describe('detectXmlRootElement', () => {
  it('returns the root element name from XML without a declaration', () => {
    const buf = Buffer.from('<ResultList xmlns="http://example.org">');
    expect(detectXmlRootElement(buf)).toBe('ResultList');
  });

  it('skips <?xml ...?> and returns the first real element name', () => {
    const buf = Buffer.from('<?xml version="1.0" encoding="utf-8"?><StartList xmlns="...">');
    expect(detectXmlRootElement(buf)).toBe('StartList');
  });

  it('returns null when the buffer contains no XML element', () => {
    expect(detectXmlRootElement(Buffer.from('not xml at all'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findImportStateByHash
// ---------------------------------------------------------------------------

describe('findImportStateByHash', () => {
  it('returns true when a matching successful import row exists', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce({ id: 1 });

    const result = await findImportStateByHash(
      'event-1',
      ImportSourceType.IOF_XML,
      'ResultList',
      'abc123',
    );

    expect(result).toBe(true);
    expect(mockPrisma.eventImportState.findFirst).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        sourceType: ImportSourceType.IOF_XML,
        payloadType: 'ResultList',
        rawHash: 'abc123',
        lastSuccessfulImportAt: { not: null },
      },
      select: { id: true },
    });
  });

  it('returns false when no matching row is found', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce(null);

    const result = await findImportStateByHash(
      'event-1',
      ImportSourceType.IOF_XML,
      'ResultList',
      'abc123',
    );

    expect(result).toBe(false);
  });

  it('does not match when the same hash is stored for a different eventId', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce(null);

    const result = await findImportStateByHash(
      'event-99',
      ImportSourceType.IOF_XML,
      'ResultList',
      'abc123',
    );

    expect(result).toBe(false);
    expect(mockPrisma.eventImportState.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ eventId: 'event-99' }) }),
    );
  });

  it('does not match when the same hash is stored for a different payloadType', async () => {
    mockPrisma.eventImportState.findFirst.mockResolvedValueOnce(null);

    const result = await findImportStateByHash(
      'event-1',
      ImportSourceType.IOF_XML,
      'StartList',
      'abc123',
    );

    expect(result).toBe(false);
    expect(mockPrisma.eventImportState.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ payloadType: 'StartList' }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// upsertImportState
// ---------------------------------------------------------------------------

describe('upsertImportState', () => {
  it('calls upsert with the correct compound unique key and sets lastSuccessfulImportAt to now', async () => {
    const now = new Date('2026-05-04T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockPrisma.eventImportState.upsert.mockResolvedValueOnce({});

    await upsertImportState('event-1', ImportSourceType.IOF_XML, {
      payloadType: 'ResultList',
      rawHash: 'deadbeef',
      creator: 'QuickEvent 3.5.3',
      externalCreateTime: new Date('2026-04-23T15:02:02.000Z'),
      formatVersion: '3.0',
      externalStatus: 'Complete',
      rootElement: 'ResultList',
    });

    expect(mockPrisma.eventImportState.upsert).toHaveBeenCalledWith({
      where: {
        eventId_sourceType_payloadType: {
          eventId: 'event-1',
          sourceType: ImportSourceType.IOF_XML,
          payloadType: 'ResultList',
        },
      },
      update: expect.objectContaining({
        rawHash: 'deadbeef',
        creator: 'QuickEvent 3.5.3',
        lastSuccessfulImportAt: now,
        successCount: { increment: 1 },
      }),
      create: expect.objectContaining({
        eventId: 'event-1',
        sourceType: ImportSourceType.IOF_XML,
        payloadType: 'ResultList',
        rawHash: 'deadbeef',
        creator: 'QuickEvent 3.5.3',
        lastSuccessfulImportAt: now,
        successCount: 1,
        skippedCount: 0,
      }),
    });
  });
});

// ---------------------------------------------------------------------------
// recordSkippedImport
// ---------------------------------------------------------------------------

describe('recordSkippedImport', () => {
  it('calls updateMany scoped to eventId + sourceType + payloadType + rawHash', async () => {
    mockPrisma.eventImportState.updateMany.mockResolvedValueOnce({ count: 1 });

    await recordSkippedImport('event-1', ImportSourceType.IOF_XML, 'ResultList', 'abc123');

    expect(mockPrisma.eventImportState.updateMany).toHaveBeenCalledWith({
      where: {
        eventId: 'event-1',
        sourceType: ImportSourceType.IOF_XML,
        payloadType: 'ResultList',
        rawHash: 'abc123',
      },
      data: expect.objectContaining({
        lastSkippedAt: expect.any(Date),
        skippedCount: { increment: 1 },
      }),
    });
  });
});
