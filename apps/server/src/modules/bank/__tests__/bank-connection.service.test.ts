import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../../../exceptions/index.js';
import {
  createBankConnection,
  recordBankSyncReport,
  reportBankTransactions,
  revokeBankConnection,
  updateBankConnection,
} from '../bank-connection.service.js';
import { bankSyncReportSchema, createBankConnectionSchema } from '../bank.schema.js';

const DEVICE = '0d3c8f3e-2f7a-4a63-9a43-6f7d52d4f1aa';
const NOW = new Date('2026-10-28T10:00:00Z');
const row = (patch: Record<string, unknown> = {}) => ({
  id: 'conn',
  ownerId: 7,
  provider: 'FIO',
  mode: 'LIVE',
  name: 'Fio race account',
  accountIdentifier: 'CZ6508000000192000145399',
  variableSymbolPrefix: '82',
  prefixEffectiveFrom: new Date('2026-10-20T00:00:00Z'),
  status: 'ACTIVE',
  collectorDeviceId: DEVICE,
  lastSeenAt: null,
  lastSuccessfulSyncAt: null,
  lastRelevantAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  revokedAt: null,
  ...patch,
});

function mockDb() {
  const db = {
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    bankConnection: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row()),
      findFirst: vi.fn().mockResolvedValue(row()),
      findMany: vi.fn().mockResolvedValue([row()]),
      create: vi.fn().mockResolvedValue(row()),
      update: vi.fn(async ({ data }) => row(data)),
    },
    bankSyncLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return db;
}
let db: ReturnType<typeof mockDb>;
beforeEach(() => {
  db = mockDb();
});

const create = {
  provider: 'FIO',
  mode: 'LIVE',
  name: 'Fio race account',
  accountIdentifier: 'CZ65 0800 0000 1920 0014 5399',
  variableSymbolPrefix: '82',
  prefixEffectiveFrom: '2026-10-20',
  deviceId: DEVICE,
};

describe('bank connection validation', () => {
  it('normalizes the IBAN and rejects tokens or malformed values', () => {
    expect(createBankConnectionSchema.parse(create).accountIdentifier).toBe(
      'CZ6508000000192000145399',
    );
    for (const change of [
      { accountIdentifier: 'a1b2c3-fio-token' },
      { variableSymbolPrefix: '' },
      { variableSymbolPrefix: '12345678901' },
      { variableSymbolPrefix: '8a' },
      { prefixEffectiveFrom: '2026-13-01' },
      { provider: 'KB' },
      { deviceId: 'pc-1' },
      { token: 'secret' },
    ])
      expect(createBankConnectionSchema.safeParse({ ...create, ...change }).success).toBe(false);
  });

  it('requires an ordered sync report', () => {
    const report = {
      deviceId: DEVICE,
      startedAt: '2026-10-28T10:00:00Z',
      finishedAt: '2026-10-28T10:00:05Z',
      status: 'OK',
      fetchedCount: 12,
      relevantCount: 1,
      errorCode: null,
    };
    expect(bankSyncReportSchema.parse(report)).toMatchObject({ matchedCount: 0 });
    expect(
      bankSyncReportSchema.safeParse({ ...report, finishedAt: '2026-10-28T09:59:59Z' }).success,
    ).toBe(false);
  });
});

describe('bank connection service', () => {
  it('creates once per owner and account and returns the existing connection', async () => {
    const input = createBankConnectionSchema.parse(create);
    await expect(createBankConnection(db as never, 7, input)).resolves.toMatchObject({
      created: true,
      connection: { id: 'conn', prefixEffectiveFrom: '2026-10-20' },
    });
    expect(db.bankConnection.create.mock.calls[0]![0].data).toMatchObject({
      ownerId: 7,
      prefixEffectiveFrom: new Date('2026-10-20T00:00:00Z'),
    });
    db.bankConnection.findUnique.mockResolvedValueOnce(row());
    await expect(createBankConnection(db as never, 7, input)).resolves.toMatchObject({
      created: false,
    });
    expect(db.bankConnection.create).toHaveBeenCalledTimes(1);
  });

  it('never changes the prefix retroactively', async () => {
    await expect(
      updateBankConnection(db as never, 7, 'conn', { variableSymbolPrefix: '83' }, NOW),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateBankConnection(
        db as never,
        7,
        'conn',
        { variableSymbolPrefix: '83', prefixEffectiveFrom: '2026-10-27' },
        NOW,
      ),
    ).rejects.toThrow(ValidationError);
    await expect(
      updateBankConnection(
        db as never,
        7,
        'conn',
        { variableSymbolPrefix: '83', prefixEffectiveFrom: '2026-10-28' },
        NOW,
      ),
    ).resolves.toMatchObject({ variableSymbolPrefix: '83', prefixEffectiveFrom: '2026-10-28' });
  });

  it('hides other owners and refuses reports on paused or revoked connections', async () => {
    db.bankConnection.findFirst.mockResolvedValueOnce(null);
    await expect(revokeBankConnection(db as never, 8, 'conn')).rejects.toThrow(NotFoundError);
    expect(db.bankConnection.findFirst).toHaveBeenCalledWith({ where: { id: 'conn', ownerId: 8 } });

    for (const status of ['PAUSED', 'REVOKED']) {
      db.bankConnection.findFirst.mockResolvedValueOnce(row({ status }));
      await expect(reportBankTransactions(db as never, 7, 'conn', DEVICE, [{}])).rejects.toThrow(
        ConflictError,
      );
    }
  });

  it('revokes with a timestamp', async () => {
    await expect(revokeBankConnection(db as never, 7, 'conn', NOW)).resolves.toMatchObject({
      status: 'REVOKED',
      revokedAt: NOW.toISOString(),
    });
  });

  it('records the heartbeat and only advances success times on OK runs', async () => {
    const report = bankSyncReportSchema.parse({
      deviceId: DEVICE,
      startedAt: '2026-10-28T10:00:00Z',
      finishedAt: '2026-10-28T10:00:05Z',
      status: 'ERROR',
      fetchedCount: 0,
      relevantCount: 0,
      errorCode: 'FIO_429',
    });
    await recordBankSyncReport(db as never, 7, 'conn', report, NOW);
    expect(db.bankSyncLog.create.mock.calls[0]![0].data).toMatchObject({
      connectionId: 'conn',
      status: 'ERROR',
      errorCode: 'FIO_429',
    });
    expect(db.bankConnection.update.mock.calls[0]![0].data).toEqual({
      collectorDeviceId: DEVICE,
      lastSeenAt: NOW,
    });
  });
});
