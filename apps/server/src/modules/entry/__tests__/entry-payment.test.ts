import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { createEntryPaymentSchema, entryPaymentQuerySchema } from '../entry-payment.schema.js';
import { listEntryPayments, recordEntryPayment } from '../entry-payment.service.js';
import { entryPaymentTransaction } from '../entry-payment-write.js';
import { updateEntryOrderPaid } from '../entry.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const input = {
  clientPaymentId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
  method: 'CASH' as const,
  amount: 250,
  currency: 'CZK',
  paidAt: '2026-10-25T10:00:00+01:00',
  deviceId: 'desk-1',
};
const receipt = () => ({
  ...input,
  id: 'receipt-1',
  eventId: 'race',
  entryId: 'entry-1',
  operatorId: 7,
  amount: new Prisma.Decimal(input.amount),
  paidAt: new Date(input.paidAt),
  recordedAt: new Date('2026-10-25T12:00:00Z'),
});
function mockDb() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
    event: { findUnique: vi.fn().mockResolvedValue({ authorId: 7 }) },
    entry: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ currency: 'CZK', totalAmount: new Prisma.Decimal(250), paid: false }),
      update: vi.fn(),
    },
    entryPayment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(receipt()),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal(250) } }),
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([receipt()]),
    },
  };
  return { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
}
let db: ReturnType<typeof mockDb>;
beforeEach(() => {
  db = mockDb();
});
const record = (
  data: Parameters<typeof recordEntryPayment>[4] = input,
  actor: Parameters<typeof recordEntryPayment>[1] = auth,
) => recordEntryPayment(db as never, actor, 'race', 'entry-1', data);

describe('entry payment validation', () => {
  it('accepts exact cents and timezone-qualified millisecond precision', () => {
    for (const amount of [0.01, 0.29, 250, 99999999.99]) {
      expect(createEntryPaymentSchema.safeParse({ ...input, amount }).success).toBe(true);
    }
    for (const fraction of ['', '.1', '.12', '.123']) {
      expect(
        createEntryPaymentSchema.safeParse({ ...input, paidAt: `2026-10-25T10:00:00${fraction}Z` })
          .success,
      ).toBe(true);
    }
  });
  it('rejects invalid money, missing offsets, identities and client-supplied operator', () => {
    for (const change of [
      { amount: 0 },
      { amount: -1 },
      { amount: 1.005 },
      { amount: 100000000 },
      { amount: Infinity },
      { amount: '250' },
      { method: 'CARD' },
      { currency: 'czk' },
      { paidAt: '2026-10-25T10:00:00' },
      { paidAt: '2026-10-25T10:00:00.1234Z' },
      { deviceId: '  ' },
      { clientPaymentId: 'bad' },
      { operatorId: 99 },
    ])
      expect(createEntryPaymentSchema.safeParse({ ...input, ...change }).success).toBe(false);
    expect(entryPaymentQuerySchema.safeParse({ since: 'yesterday' }).success).toBe(false);
  });
});

describe('entry payment service', () => {
  it('records an attributed receipt and audits the calculated paid transition', async () => {
    expect(await record()).toMatchObject({
      created: true,
      payment: { amount: 250, operatorId: 7 },
    });
    expect(db.entryPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ operatorId: 7, eventId: 'race', entryId: 'entry-1' }),
    });
    expect(db.entry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: {
        paid: true,
        statusHistory: { create: { status: null, paymentState: true, changedById: 7 } },
      },
    });
  });
  it('allows partial and excess payments and recalculates historical paid flags', async () => {
    for (const [sum, oldPaid, expected] of [
      [100, true, false],
      [250, false, true],
      [300, false, true],
    ] as const) {
      db.entry.findUniqueOrThrow.mockResolvedValue({
        currency: 'CZK',
        totalAmount: new Prisma.Decimal(250),
        paid: oldPaid,
      });
      db.entryPayment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(sum) } });
      await record();
      expect(db.entry.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ paid: expected }) }),
      );
    }
  });
  it('does not create redundant paid-state audit records', async () => {
    db.entryPayment.aggregate.mockResolvedValue({ _sum: { amount: new Prisma.Decimal(100) } });
    await record();
    expect(db.entry.update).not.toHaveBeenCalled();
  });
  it('returns identical retries without new receipt or paid-state side effects', async () => {
    db.entryPayment.findUnique.mockResolvedValue(receipt() as never);
    expect(await record({ ...input, paidAt: '2026-10-25T09:00:00Z' })).toMatchObject({
      created: false,
    });
    expect(db.entryPayment.create).not.toHaveBeenCalled();
    expect(db.entry.update).not.toHaveBeenCalled();
  });
  it('preserves the original operator when an admin retries the same receipt', async () => {
    db.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
    db.entryPayment.findUnique.mockResolvedValue(receipt() as never);
    expect(await record(input, { ...auth, userId: 8 })).toMatchObject({
      payment: { operatorId: 7 },
    });
  });
  it('conflicts when any immutable payload field or entry changes', async () => {
    db.entryPayment.findUnique.mockResolvedValue(receipt() as never);
    for (const change of [
      { amount: 251 },
      { method: 'QR' as const },
      { currency: 'EUR' },
      { paidAt: '2026-10-25T09:00:01Z' },
      { deviceId: 'desk-2' },
    ]) {
      await expect(record({ ...input, ...change })).rejects.toThrow('different payment payload');
    }
    await expect(recordEntryPayment(db as never, auth, 'race', 'entry-2', input)).rejects.toThrow(
      'different payment payload',
    );
  });
  it('handles the unique-index winner after a simultaneous cross-entry insert', async () => {
    db.entryPayment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }),
    );
    db.entryPayment.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(receipt() as never);
    expect(await record()).toMatchObject({ created: false });
  });
  it('rejects currency mismatch and entries outside the event', async () => {
    await expect(record({ ...input, currency: 'EUR' })).rejects.toThrow('currency');
    expect(db.entryPayment.create).not.toHaveBeenCalled();
    db.$queryRaw.mockResolvedValue([]);
    await expect(record()).rejects.toThrow('not found for this event');
  });
  it('requires a user JWT and event owner or admin access', async () => {
    for (const actor of [
      { isAuthenticated: false },
      { ...auth, type: 'eventBasic' as const },
      { ...auth, userId: 8 },
    ]) {
      await expect(
        recordEntryPayment(db as never, actor, 'race', 'entry-1', input),
      ).rejects.toThrow();
      await expect(listEntryPayments(db as never, actor, 'race', {})).rejects.toThrow();
    }
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });
  it('filters reports by event, device and inclusive server recording time', async () => {
    const since = '2026-10-25T12:00:00Z';
    expect(
      await listEntryPayments(db as never, auth, 'race', { since, deviceId: 'desk-1' }),
    ).toMatchObject([{ amount: 250, paidAt: '2026-10-25T09:00:00.000Z' }]);
    expect(db.entryPayment.findMany).toHaveBeenCalledWith({
      where: { eventId: 'race', deviceId: 'desk-1', recordedAt: { gte: new Date(since) } },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    });
  });
  it('rejects manual paid updates once receipts exist', async () => {
    await expect(
      updateEntryOrderPaid(db as never, { eventId: 'race', entryId: 'entry-1', paid: false }),
    ).rejects.toThrow('managed by payment receipts');
    expect(db.entry.update).not.toHaveBeenCalled();
  });
  it('retries transient transaction conflicts with a bounded policy', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2034',
      clientVersion: 'test',
    });
    db.$transaction.mockRejectedValueOnce(conflict);
    await entryPaymentTransaction(db as never, 'race', 'entry-1', async () => true);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    db.$transaction.mockReset().mockRejectedValue(conflict);
    await expect(
      entryPaymentTransaction(db as never, 'race', 'entry-1', async () => true),
    ).rejects.toThrow('conflict');
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
});
