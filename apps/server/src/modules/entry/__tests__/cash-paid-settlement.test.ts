import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { updateEntryOrderPaid, entryOrderPaidUpdateForGraphQL } from '../entry.service.js';
import { listPaymentInsights, recordEntryPayment } from '../entry-payment.service.js';
const decimal = (value: number) => new Prisma.Decimal(value);
function database(initialPaid = false, initialReceipt = 0, total = 250) {
  const entry = {
    id: 'entry',
    eventId: 'event',
    status: 'RECEIVED',
    paymentMethod: 'CASH',
    paid: initialPaid,
    paymentReference: '2600000001',
    userId: null,
    contactEmail: 'cash@test.invalid',
    contactFirstname: 'Test',
    contactLastname: 'Cash',
    totalAmount: decimal(total),
    currency: 'CZK',
    createdAt: new Date(),
    items: [],
  };
  const payments: Array<Record<string, unknown> & { amount: Prisma.Decimal }> = initialReceipt
    ? [{ amount: decimal(initialReceipt) }]
    : [];
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'entry' }]),
    $transaction: vi.fn(),
    event: { findUnique: vi.fn().mockResolvedValue({ authorId: 7 }) },
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
    entry: {
      findFirst: vi.fn().mockImplementation(async () => entry),
      findUnique: vi.fn().mockImplementation(async () => entry),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => entry),
      update: vi.fn().mockImplementation(async ({ data }) => {
        entry.paid = data.paid;
        return entry;
      }),
    },
    entryPayment: {
      count: vi.fn().mockImplementation(async () => payments.length),
      aggregate: vi.fn().mockImplementation(async () => ({
        _sum: {
          amount: payments.length
            ? payments.reduce((sum, payment) => sum.plus(payment.amount), decimal(0))
            : null,
        },
      })),
      create: vi.fn().mockImplementation(async ({ data }) => {
        const payment = {
          ...data,
          id: 'receipt',
          source: 'MANUAL',
          bankTransactionId: null,
          recordedAt: new Date(),
          amount: data.amount,
        };
        payments.push(payment);
        return payment;
      }),
      findMany: vi.fn().mockImplementation(async () =>
        payments.map((payment) => ({
          ...payment,
          entry: {
            paymentReference: entry.paymentReference,
            contactFirstname: entry.contactFirstname,
            contactLastname: entry.contactLastname,
          },
        })),
      ),
    },
  };
  db.$transaction.mockImplementation(async (operation) => operation(db));
  return { db, entry, payments };
}
const input = { eventId: 'event', entryId: 'entry', paid: true, changedById: 7 };
const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
describe('mark cash entry paid', () => {
  it('records a CASH receipt and exposes it in received-payment insights', async () => {
    const { db } = database();
    const before = Date.now();
    const result = await updateEntryOrderPaid(db as never, { ...input, deviceId: 'desk-1' });
    expect(result.paid).toBe(true);
    const data = db.entryPayment.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      eventId: 'event',
      entryId: 'entry',
      operatorId: 7,
      method: 'CASH',
      currency: 'CZK',
      deviceId: 'desk-1',
    });
    expect(data.amount.toNumber()).toBe(250);
    expect(data.paidAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.clientPaymentId).toMatch(/^[0-9a-f-]{36}$/);
    const report = await listPaymentInsights(db as never, auth, 'event');
    expect(report).toMatchObject([
      { method: 'CASH', amount: 250, deviceId: 'desk-1', operatorId: 7 },
    ]);
  });
  it('collects only the remaining balance and does not duplicate a repeated settlement', async () => {
    const { db, payments } = database(false, 100);
    await updateEntryOrderPaid(db as never, input);
    expect(db.entryPayment.create.mock.calls[0]![0].data.amount.toNumber()).toBe(150);
    await updateEntryOrderPaid(db as never, input);
    expect(payments).toHaveLength(2);
    expect(db.entryPayment.create).toHaveBeenCalledOnce();
    expect(db.entryPayment.create.mock.calls[0]![0].data.deviceId).toBe('server:entry-paid-update');
  });
  it('leaves overpayments intact and rejects clearing receipt-backed paid state', async () => {
    const { db } = database(true, 300);
    await updateEntryOrderPaid(db as never, input);
    expect(db.entryPayment.create).not.toHaveBeenCalled();
    await expect(updateEntryOrderPaid(db as never, { ...input, paid: false })).rejects.toThrow(
      'managed by payment receipts',
    );
  });
  it('does not fabricate a zero-amount receipt for a free entry', async () => {
    const { db } = database(false, 0, 0);
    await expect(updateEntryOrderPaid(db as never, input)).resolves.toMatchObject({ paid: true });
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });
  it('requires operator attribution and validates optional device metadata', async () => {
    const { db } = database();
    await expect(
      updateEntryOrderPaid(db as never, { ...input, changedById: null }),
    ).rejects.toThrow('operator');
    await expect(updateEntryOrderPaid(db as never, { ...input, deviceId: ' ' })).rejects.toThrow(
      'device',
    );
    expect(db.entryPayment.create).not.toHaveBeenCalled();
  });
  it('preserves non-cash manual flags and authorization', async () => {
    const { db, entry } = database();
    entry.paymentMethod = 'QR_PAYMENT';
    await updateEntryOrderPaid(db as never, input);
    expect(db.entryPayment.create).not.toHaveBeenCalled();
    const stranger = database().db;
    stranger.event.findUnique.mockResolvedValue({ authorId: 8 });
    await expect(
      entryOrderPaidUpdateForGraphQL(stranger as never, auth, { entryId: 'entry', paid: true }),
    ).rejects.toThrow();
    expect(stranger.entryPayment.create).not.toHaveBeenCalled();
  });
  it('records an explicitly confirmed legacy cash flag at the current time without bulk backfill', async () => {
    const { db } = database(true);
    await updateEntryOrderPaid(db as never, input);
    expect(db.entryPayment.create).toHaveBeenCalledOnce();
  });
});

it('includes a POS-posted cash receipt in the same received-payments report', async () => {
  const { db } = database();
  Object.assign(db.entryPayment, { findUnique: vi.fn().mockResolvedValue(null) });
  await recordEntryPayment(db as never, auth, 'event', 'entry', {
    clientPaymentId: '11111111-1111-4111-8111-111111111111',
    method: 'CASH',
    amount: 250,
    currency: 'CZK',
    paidAt: '2026-11-04T09:00:00Z',
    deviceId: 'ofeed-desk-test',
  });
  const report = await listPaymentInsights(db as never, auth, 'event');
  expect(report).toMatchObject([
    { method: 'CASH', amount: 250, deviceId: 'ofeed-desk-test', operatorId: 7 },
  ]);
});
