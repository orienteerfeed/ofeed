import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError, ValidationError } from '../../../exceptions/index.js';
import { Prisma, type BankConnection } from '../../../generated/prisma/client.js';
import {
  ignoreBankTransaction,
  ingestBankTransaction,
  matchBankTransactionManually,
  rematchEntryBankTransactions,
} from '../bank-matching.js';

const D = (value: string | number) => new Prisma.Decimal(value);
const DEVICE = '0d3c8f3e-2f7a-4a63-9a43-6f7d52d4f1aa';
const connection = {
  id: 'conn',
  ownerId: 7,
  provider: 'FIO',
  mode: 'LIVE',
  name: 'Fio race account',
  accountIdentifier: 'CZ7920100000002900000001',
  variableSymbolPrefix: '82',
  prefixEffectiveFrom: new Date('2026-10-20T00:00:00Z'),
  status: 'ACTIVE',
} as BankConnection;
const item = {
  providerTransactionId: '1148734530',
  amount: '1490.00',
  currency: 'CZK',
  variableSymbol: '8200012345',
  bookingDate: '2026-10-20',
  source: 'BANK_API',
};

type Setup = {
  candidates?: Array<{ id: string; eventId: string }>;
  entry?: { id: string; eventId: string; totalAmount: Prisma.Decimal; currency: string } | null;
  received?: Prisma.Decimal | null;
};

function mockDb({
  candidates = [{ id: 'entry-1', eventId: 'race' }],
  entry = { id: 'entry-1', eventId: 'race', totalAmount: D('1490.00'), currency: 'CZK' },
  received = null,
}: Setup = {}) {
  let stored: Record<string, unknown> = {};
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
    bankTransaction: {
      findUnique: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(async () => stored),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = {
          id: 'bt-1',
          trust: 'CLIENT_REPORTED',
          matchedEntryId: null,
          matchedAmount: null,
          receivedAt: new Date('2026-10-21T08:00:00Z'),
          ...data,
        };
        return stored;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        stored = { ...stored, ...data };
        return stored;
      }),
    },
    entry: {
      findMany: vi.fn().mockResolvedValue(candidates),
      findFirst: vi.fn().mockResolvedValue(entry),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ totalAmount: entry?.totalAmount ?? D(0), paid: false }),
      update: vi.fn(),
    },
    entryPayment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: received } }),
      create: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ bankPushStatuses: null }) },
    bankPaymentNotification: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  return db;
}

let db: ReturnType<typeof mockDb>;
beforeEach(() => {
  db = mockDb();
});
const ingest = (raw: unknown = item, conn: BankConnection = connection) =>
  ingestBankTransaction(db as never, conn, raw, DEVICE);

describe('bank transaction ingestion', () => {
  it('matches an exact outstanding amount and writes one bank-import receipt', async () => {
    const matchedFrom = Date.now();
    await expect(ingest()).resolves.toEqual({
      providerTransactionId: '1148734530',
      status: 'MATCHED',
      entryId: 'entry-1',
      label: 'Order #8200012345',
      matchedAmount: '1490.00',
    });
    expect(db.entryPayment.create).toHaveBeenCalledTimes(1);
    expect(db.entryPayment.create.mock.calls[0]![0].data).toMatchObject({
      eventId: 'race',
      entryId: 'entry-1',
      method: 'QR',
      source: 'BANK_IMPORT',
      currency: 'CZK',
      deviceId: DEVICE,
      operatorId: 7,
      bankTransactionId: 'bt-1',
    });
    // The bank reports no time: paidAt is the server match time, not booking-day midnight.
    const { paidAt } = db.entryPayment.create.mock.calls[0]![0].data as { paidAt: Date };
    expect(paidAt.getTime()).toBeGreaterThanOrEqual(matchedFrom);
    expect(paidAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(db.$queryRaw).toHaveBeenCalled(); // entry-row lock of the receipt ledger
  });

  it('classifies against the outstanding amount', async () => {
    db = mockDb();
    expect((await ingest({ ...item, amount: '1000.00' })).status).toBe('PARTIALLY_PAID');
    db = mockDb({ received: D('1000.00') });
    expect((await ingest({ ...item, amount: '490.00' })).status).toBe('MATCHED');
    db = mockDb();
    expect((await ingest({ ...item, amount: '1500.00' })).status).toBe('OVERPAID');
    expect(db.entryPayment.create.mock.calls[0]![0].data.amount).toEqual(D('1500.00'));
  });

  it('never writes a receipt for ambiguous, unmatched or closed orders', async () => {
    db = mockDb({
      candidates: [
        { id: 'entry-1', eventId: 'race' },
        { id: 'entry-2', eventId: 'other' },
      ],
    });
    expect((await ingest()).status).toBe('AMBIGUOUS');
    db = mockDb({ candidates: [] });
    expect((await ingest()).status).toBe('UNMATCHED');
    db = mockDb({ entry: null }); // cancelled between lookup and lock
    expect((await ingest()).status).toBe('UNMATCHED');
    db = mockDb({
      entry: { id: 'entry-1', eventId: 'race', totalAmount: D('1490.00'), currency: 'EUR' },
    });
    expect((await ingest()).status).toBe('UNMATCHED');
    db = mockDb();
    expect((await ingest({ ...item, amount: '100000000.00' })).status).toBe('UNMATCHED');
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });

  it('scopes candidates to the owner, open orders and demo events for test data', async () => {
    await ingest();
    expect(db.entry.findMany.mock.calls[0]![0].where).toEqual({
      paymentReference: '8200012345',
      status: { notIn: ['CANCELLED', 'REJECTED'] },
      event: { authorId: 7 },
    });
    db = mockDb();
    await ingest({ ...item, source: 'SIMULATED' }, { ...connection, mode: 'TEST' });
    expect(db.entry.findMany.mock.calls[0]![0].where.event).toEqual({ authorId: 7, demo: true });
  });

  it('ignores items outside the prefix or before the effective day', async () => {
    expect((await ingest({ ...item, variableSymbol: '9100012345' })).status).toBe('IGNORED');
    expect((await ingest({ ...item, bookingDate: '2026-10-19' })).status).toBe('IGNORED');
    expect(db.entry.findMany).not.toHaveBeenCalled();
  });

  it('keeps leading zeros of the variable symbol', async () => {
    await ingest({ ...item, variableSymbol: '0012' }, { ...connection, variableSymbolPrefix: '0' });
    expect(db.entry.findMany.mock.calls[0]![0].where.paymentReference).toBe('0012');
  });

  it('reports DUPLICATE for stored items and concurrent retries', async () => {
    const winner = {
      providerTransactionId: '1148734530',
      variableSymbol: '8200012345',
      matchingStatus: 'MATCHED',
      matchedEntryId: 'entry-1',
      matchedAmount: D('1490.00'),
    };
    db.bankTransaction.findUnique.mockResolvedValueOnce(winner);
    await expect(ingest()).resolves.toMatchObject({ status: 'DUPLICATE', entryId: 'entry-1' });
    expect(db.bankTransaction.create).not.toHaveBeenCalled();

    db = mockDb();
    db.bankTransaction.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    db.bankTransaction.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7' }),
    );
    await expect(ingest()).resolves.toMatchObject({ status: 'DUPLICATE' });
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });

  it('rejects invalid items individually', async () => {
    for (const change of [
      { amount: 1490 },
      { amount: '1490.5' },
      { amount: '0.00' },
      { currency: 'czk' },
      { variableSymbol: '82000123456' },
      { bookingDate: '20.10.2026' },
      { payerName: 'Jane' },
    ]) {
      await expect(ingest({ ...item, ...change })).resolves.toMatchObject({
        providerTransactionId: '1148734530',
        status: 'INVALID',
      });
    }
    await expect(ingest({ ...item, source: 'SIMULATED' })).resolves.toMatchObject({
      status: 'INVALID',
      issues: [{ path: 'source' }],
    });
    await expect(ingest('garbage')).resolves.toMatchObject({
      providerTransactionId: null,
      status: 'INVALID',
    });
    expect(db.bankTransaction.create).not.toHaveBeenCalled();
  });
});

describe('manual resolution', () => {
  const owned = (matchingStatus: string, currency = 'CZK') => ({
    id: 'bt-1',
    connectionId: 'conn',
    providerTransactionId: '1148734530',
    amount: D('1490.00'),
    currency,
    variableSymbol: '8200099999',
    bookingDate: new Date('2026-10-20T00:00:00Z'),
    source: 'BANK_API',
    trust: 'CLIENT_REPORTED',
    matchingStatus,
    matchedEntryId: null,
    matchedAmount: null,
    reportedByDeviceId: DEVICE,
    receivedAt: new Date('2026-10-21T08:00:00Z'),
    connection: { mode: 'LIVE' },
  });

  it('matches an unmatched transaction to an owned open order', async () => {
    const row = owned('UNMATCHED');
    db.bankTransaction.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce(row);
    db.bankTransaction.update.mockImplementationOnce(async ({ data }) => ({ ...row, ...data }));
    await expect(
      matchBankTransactionManually(db as never, 7, 'bt-1', 'entry-1'),
    ).resolves.toMatchObject({
      matchingStatus: 'MATCHED',
      matchedEntryId: 'entry-1',
      matchedAmount: '1490.00',
    });
    expect(db.entryPayment.create).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign, resolved or mismatched transactions', async () => {
    db.bankTransaction.findFirst.mockResolvedValueOnce(null);
    await expect(matchBankTransactionManually(db as never, 8, 'bt-1', 'entry-1')).rejects.toThrow(
      NotFoundError,
    );
    db.bankTransaction.findFirst.mockResolvedValueOnce(owned('MATCHED'));
    await expect(matchBankTransactionManually(db as never, 7, 'bt-1', 'entry-1')).rejects.toThrow(
      ConflictError,
    );
    db.bankTransaction.findFirst.mockResolvedValueOnce(owned('UNMATCHED', 'EUR'));
    await expect(matchBankTransactionManually(db as never, 7, 'bt-1', 'entry-1')).rejects.toThrow(
      ValidationError,
    );
    db.bankTransaction.findFirst.mockResolvedValueOnce(owned('AMBIGUOUS'));
    db.entry.findFirst.mockResolvedValueOnce(null);
    await expect(matchBankTransactionManually(db as never, 7, 'bt-1', 'other')).rejects.toThrow(
      NotFoundError,
    );
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });

  it('ignores only unresolved transactions', async () => {
    db.bankTransaction.findFirst.mockResolvedValue(owned('UNMATCHED'));
    db.bankTransaction.findUniqueOrThrow.mockResolvedValueOnce(owned('IGNORED'));
    await expect(ignoreBankTransaction(db as never, 7, 'bt-1')).resolves.toMatchObject({
      matchingStatus: 'IGNORED',
    });
    db.bankTransaction.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(ignoreBankTransaction(db as never, 7, 'bt-1')).rejects.toThrow(ConflictError);
  });
});

describe('rematching after order changes', () => {
  const row = {
    id: 'bt-1',
    amount: D('1490.00'),
    currency: 'CZK',
    variableSymbol: '8200012345',
    bookingDate: new Date('2026-10-20T00:00:00Z'),
    source: 'BANK_API',
    matchingStatus: 'UNMATCHED',
    reportedByDeviceId: DEVICE,
    connection: { mode: 'LIVE' },
  };

  it('settles an unmatched transaction once the order is the only candidate', async () => {
    db.entry.findUnique.mockResolvedValue({
      paymentReference: '8200012345',
      event: { authorId: 7, demo: false },
    });
    db.bankTransaction.findMany.mockResolvedValue([row]);
    await rematchEntryBankTransactions(db as never, 'entry-1');
    expect(db.bankTransaction.findMany.mock.calls[0]![0].where).toEqual({
      variableSymbol: '8200012345',
      matchingStatus: 'UNMATCHED',
      connection: { ownerId: 7, mode: 'LIVE' },
      source: 'BANK_API',
    });
    expect(db.entryPayment.create).toHaveBeenCalledTimes(1);

    db.entryPayment.create.mockClear();
    db.entry.count.mockResolvedValue(2);
    await rematchEntryBankTransactions(db as never, 'entry-1');
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });

  it('does nothing for events without an owner', async () => {
    db.entry.findUnique.mockResolvedValue({
      paymentReference: '8200012345',
      event: { authorId: null, demo: false },
    });
    await rematchEntryBankTransactions(db as never, 'entry-1');
    expect(db.bankTransaction.findMany).not.toHaveBeenCalled();
  });
});

describe('payment push outbox', () => {
  const queued = () =>
    db.bankPaymentNotification.createMany.mock.calls.map(([args]) => args.data[0].matchingStatus);

  it('queues one push per stored notifiable status, inside the matching transaction', async () => {
    await ingest();
    expect(db.bankPaymentNotification.createMany).toHaveBeenCalledWith({
      data: [{ userId: 7, bankTransactionId: 'bt-1', matchingStatus: 'MATCHED' }],
      skipDuplicates: true,
    });
    db = mockDb({ candidates: [] });
    await ingest();
    expect(queued()).toEqual(['UNMATCHED']);
    expect(db.$transaction).toHaveBeenCalled();
    db = mockDb();
    await ingest({ ...item, amount: '1500.00' });
    expect(queued()).toEqual(['OVERPAID']);
  });

  it('never queues for partial, ambiguous, ignored, duplicate or invalid items', async () => {
    await ingest({ ...item, amount: '100.00' });
    await ingest({ ...item, variableSymbol: '9100012345' });
    await ingest({ ...item, amount: 1490 });
    db.bankTransaction.findUnique.mockResolvedValueOnce({
      providerTransactionId: '1148734530',
      variableSymbol: '8200012345',
      matchingStatus: 'MATCHED',
      matchedEntryId: 'entry-1',
      matchedAmount: D('1490.00'),
    });
    await ingest();
    expect(db.bankPaymentNotification.createMany).not.toHaveBeenCalled();
    db = mockDb({
      candidates: [
        { id: 'entry-1', eventId: 'race' },
        { id: 'entry-2', eventId: 'other' },
      ],
    });
    await ingest();
    expect(db.bankPaymentNotification.createMany).not.toHaveBeenCalled();
  });

  it('honours per-status user settings', async () => {
    db.user.findUnique.mockResolvedValue({ bankPushStatuses: { MATCHED: false } });
    await ingest();
    expect(db.bankPaymentNotification.createMany).not.toHaveBeenCalled();
  });

  it('queues MATCHED when a rematch settles an earlier unmatched transaction', async () => {
    db.entry.findUnique.mockResolvedValue({
      paymentReference: '8200012345',
      event: { authorId: 7, demo: false },
    });
    db.bankTransaction.findMany.mockResolvedValue([
      {
        id: 'bt-9',
        amount: D('1490.00'),
        currency: 'CZK',
        variableSymbol: '8200012345',
        bookingDate: new Date('2026-10-20T00:00:00Z'),
        source: 'BANK_API',
        matchingStatus: 'UNMATCHED',
        reportedByDeviceId: DEVICE,
        connection: { mode: 'LIVE' },
      },
    ]);
    await rematchEntryBankTransactions(db as never, 'entry-1');
    expect(queued()).toEqual(['MATCHED']);
  });
});
