import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { listPaymentInsights } from '../entry-payment.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const db = (owner: number | null = 7, role = 'USER') => ({
  event: { findUnique: vi.fn().mockResolvedValue(owner === null ? null : { authorId: owner }) },
  user: { findUnique: vi.fn().mockResolvedValue({ role }) },
  entryPayment: { findMany: vi.fn().mockResolvedValue([]) },
});

describe('received payment insights', () => {
  it('requires a user JWT, event access and an existing event before reading receipts', async () => {
    for (const actor of [
      { isAuthenticated: false },
      { isAuthenticated: true, type: 'eventBasic' as const },
    ]) {
      const prisma = db();
      await expect(listPaymentInsights(prisma as never, actor, 'race')).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(prisma.entryPayment.findMany).not.toHaveBeenCalled();
    }
    for (const [owner, status] of [
      [99, 403],
      [null, 404],
    ] as const) {
      const prisma = db(owner);
      await expect(listPaymentInsights(prisma as never, auth, 'race')).rejects.toMatchObject({
        statusCode: status,
      });
      expect(prisma.entryPayment.findMany).not.toHaveBeenCalled();
    }
  });
  it('scopes an empty read to the event and permits administrators', async () => {
    const prisma = db(99, 'ADMIN');
    expect(await listPaymentInsights(prisma as never, auth, 'race')).toEqual([]);
    expect(prisma.entryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: 'race' },
        orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });
  it('enriches and serializes receipts with one batched relation query', async () => {
    const prisma = db();
    prisma.entryPayment.findMany.mockResolvedValue([
      {
        id: 'receipt',
        eventId: 'race',
        entryId: 'order',
        clientPaymentId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
        amount: new Prisma.Decimal('0.29'),
        currency: 'CZK',
        method: 'CASH',
        deviceId: 'desk',
        operatorId: 7,
        paidAt: new Date('2026-10-25T09:00:00Z'),
        recordedAt: new Date('2026-10-25T10:00:00Z'),
        entry: {
          paymentReference: '2600000001',
          contactFirstname: 'Jan',
          contactLastname: 'Novák',
        },
      },
    ] as never);
    expect(await listPaymentInsights(prisma as never, auth, 'race')).toEqual([
      expect.objectContaining({
        amount: 0.29,
        paidAt: '2026-10-25T09:00:00.000Z',
        paymentReference: '2600000001',
        contactFirstname: 'Jan',
        contactLastname: 'Novák',
      }),
    ]);
    expect(prisma.entryPayment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.entryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          entry: {
            select: { paymentReference: true, contactFirstname: true, contactLastname: true },
          },
          bankTransaction: { select: { bookingDate: true } },
        },
      }),
    );
  });
  it('returns the bank booking day for bank-import receipts only', async () => {
    const prisma = db();
    const receipt = {
      id: 'receipt',
      eventId: 'race',
      entryId: 'order',
      clientPaymentId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
      amount: new Prisma.Decimal('490'),
      currency: 'CZK',
      method: 'QR',
      deviceId: 'collector',
      operatorId: 7,
      paidAt: new Date('2026-10-26T07:12:00Z'),
      recordedAt: new Date('2026-10-26T07:12:00Z'),
      entry: { paymentReference: '2600000001', contactFirstname: 'Jan', contactLastname: 'Novák' },
    };
    prisma.entryPayment.findMany.mockResolvedValue([
      {
        ...receipt,
        source: 'BANK_IMPORT',
        bankTransaction: { bookingDate: new Date('2026-10-25T00:00:00Z') },
      },
      { ...receipt, id: 'cash', method: 'CASH', source: 'MANUAL', bankTransaction: null },
    ] as never);
    const [bank, cash] = await listPaymentInsights(prisma as never, auth, 'race');
    expect(bank).toMatchObject({ bookingDate: '2026-10-25', paidAt: '2026-10-26T07:12:00.000Z' });
    expect(bank).not.toHaveProperty('bankTransaction');
    expect(cash).toMatchObject({ bookingDate: null });
  });
});
