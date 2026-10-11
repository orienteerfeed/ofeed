import { describe, expect, it, vi } from 'vitest';

import {
  entryOrderPaidUpdateForGraphQL,
  entryOrderStatusUpdateForGraphQL,
} from '../entry.service.js';

function decimal(value: number) {
  return { toNumber: () => value };
}

function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    eventId: 'event-1',
    status: 'RECEIVED',
    paid: false,
    paymentReference: '2600000001',
    userId: 42,
    contactEmail: 'a@b.cz',
    contactFirstname: 'Jan',
    contactLastname: 'Novak',
    totalAmount: decimal(100),
    currency: 'CZK',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    items: [],
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ role: 'USER' }),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue({ id: 'event-1', authorId: 7 }),
    },
    entry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('entryOrderStatusUpdateForGraphQL', () => {
  it("lets the entry's own creator cancel it without an event owner/admin check", async () => {
    const prisma = createPrismaMock();
    prisma.entry.findUnique.mockResolvedValueOnce({ eventId: 'event-1', userId: 42 });
    prisma.entry.findFirst.mockResolvedValueOnce(makeEntryRow({ items: [] }));
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'CANCELLED' }));

    const auth = { isAuthenticated: true, type: 'jwt', userId: 42 } as const;

    await entryOrderStatusUpdateForGraphQL(prisma as never, auth, {
      entryId: 'entry-1',
      status: 'CANCELLED',
    });

    expect(prisma.event.findUnique).not.toHaveBeenCalled();
    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELLED',
          statusHistory: { create: { status: 'CANCELLED', changedById: 42 } },
        }),
      }),
    );
  });

  it('rejects a cancel request from someone who is neither the creator nor event owner/admin', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findUnique.mockResolvedValueOnce({ eventId: 'event-1', userId: 42 });
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    const auth = { isAuthenticated: true, type: 'jwt', userId: 99 } as const;

    await expect(
      entryOrderStatusUpdateForGraphQL(prisma as never, auth, {
        entryId: 'entry-1',
        status: 'CANCELLED',
      }),
    ).rejects.toThrow();

    expect(prisma.entry.update).not.toHaveBeenCalled();
  });

  it('lets the event owner/admin reject an entry order', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findUnique.mockResolvedValueOnce({ eventId: 'event-1', userId: 42 });
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'event-1', authorId: 7 });
    prisma.entry.findFirst.mockResolvedValueOnce(makeEntryRow());
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'REJECTED' }));

    const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

    await entryOrderStatusUpdateForGraphQL(prisma as never, auth, {
      entryId: 'entry-1',
      status: 'REJECTED',
    });

    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
  });

  it("requires event owner/admin even when the caller is the entry's creator but the target status isn't CANCELLED", async () => {
    const prisma = createPrismaMock();
    prisma.entry.findUnique.mockResolvedValueOnce({ eventId: 'event-1', userId: 42 });
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'event-1', authorId: 7 });

    const auth = { isAuthenticated: true, type: 'jwt', userId: 42 } as const;

    await expect(
      entryOrderStatusUpdateForGraphQL(prisma as never, auth, {
        entryId: 'entry-1',
        status: 'APPROVED',
      }),
    ).rejects.toThrow();

    expect(prisma.entry.update).not.toHaveBeenCalled();
  });

  it('rejects PROCESSED as a direct status update target', async () => {
    const prisma = createPrismaMock();

    const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

    await expect(
      entryOrderStatusUpdateForGraphQL(prisma as never, auth, {
        entryId: 'entry-1',
        status: 'PROCESSED',
      }),
    ).rejects.toThrow('PROCESSED can only be reached via entryOrderProcess.');

    expect(prisma.entry.findUnique).not.toHaveBeenCalled();
  });

  it('lets the event owner/admin update the paid flag', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findUnique.mockResolvedValueOnce({ eventId: 'event-1' });
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'event-1', authorId: 7 });
    prisma.entry.findFirst.mockResolvedValueOnce({ id: 'entry-1' });
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ paid: true }));

    const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

    await entryOrderPaidUpdateForGraphQL(prisma as never, auth, {
      entryId: 'entry-1',
      paid: true,
    });

    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          paid: true,
          statusHistory: {
            create: { status: null, paymentState: true, changedById: 7 },
          },
        },
      }),
    );
  });

  it('throws when the entry order does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findUnique.mockResolvedValueOnce(null);

    const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

    await expect(
      entryOrderStatusUpdateForGraphQL(prisma as never, auth, {
        entryId: 'entry-1',
        status: 'CANCELLED',
      }),
    ).rejects.toThrow('Entry order entry-1 does not exist.');
  });
});
