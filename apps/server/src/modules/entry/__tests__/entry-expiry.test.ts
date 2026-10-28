import { describe, expect, it, vi } from 'vitest';
import { expireEntryOrders } from '../entry-expiry.js';
import { updateEntryOrderStatusInTransaction } from '../entry.service.js';
vi.mock('../entry.service.js', () => ({ updateEntryOrderStatusInTransaction: vi.fn() }));

describe('entry expiry', () => {
  it.each([true, false])('rechecks eligibility after locking; eligible=%s', async (eligible) => {
    vi.mocked(updateEntryOrderStatusInTransaction).mockClear();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      entry: { findFirst: vi.fn().mockResolvedValue(eligible ? { id: 'order' } : null) },
    };
    const prisma = {
      entry: { findMany: vi.fn().mockResolvedValue([{ id: 'order', eventId: 'event' }]) },
      $transaction: vi.fn(async (fn) => fn(tx)),
    };
    const now = new Date('2026-10-28T12:00:00Z');
    await expireEntryOrders(prisma as never, now);
    expect(prisma.entry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'RECEIVED',
          paid: false,
          paymentMethod: { not: 'CASH' },
          paymentDueAt: { lte: now },
        },
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.entry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'order', paid: false, paymentDueAt: { lte: now } }),
      }),
    );
    expect(updateEntryOrderStatusInTransaction).toHaveBeenCalledTimes(eligible ? 1 : 0);
    if (eligible)
      expect(updateEntryOrderStatusInTransaction).toHaveBeenCalledWith(tx, {
        eventId: 'event',
        entryId: 'order',
        status: 'CANCELLED',
        changedById: null,
      });
  });
});
