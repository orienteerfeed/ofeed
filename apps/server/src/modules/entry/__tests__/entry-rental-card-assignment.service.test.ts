import { describe, expect, it, vi } from 'vitest';

import { assignEntryItemRentalCardForGraphQL } from '../entry.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ role: 'USER' }),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue({ id: 'event-1', authorId: 7 }),
    },
    competitor: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    entryItem: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    eventRentalCard: {
      findUnique: vi.fn(),
    },
  };
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    card: null,
    cardRental: true,
    entry: { id: 'entry-1', eventId: 'event-1', status: 'RECEIVED' },
    ...overrides,
  };
}

describe('assignEntryItemRentalCardForGraphQL', () => {
  it('assigns an available rental card to an item that requested a rental', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem());
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({
      active: true,
      returned: false,
    });

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).resolves.toEqual({ entryId: 'entry-1' });

    expect(prisma.entryItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { card: 111 },
    });
  });

  it('rejects when the entry item did not request a rental', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem({ cardRental: false }));

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).rejects.toThrow('This entry item did not request a rental chip.');

    expect(prisma.entryItem.update).not.toHaveBeenCalled();
  });

  it('reassigns an entry item that already has a different card', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem({ card: 999 }));
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({
      active: true,
      returned: false,
    });

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).resolves.toEqual({ entryId: 'entry-1' });

    expect(prisma.entryItem.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { card: 111 },
    });
  });

  it('is a no-op when reassigning to the same card it already holds', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem({ card: 111 }));

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).resolves.toEqual({ entryId: 'entry-1' });

    expect(prisma.entryItem.update).not.toHaveBeenCalled();
  });

  it.each(['PROCESSED', 'REJECTED', 'CANCELLED'] as const)(
    'rejects when the entry order is already %s',
    async status => {
      const prisma = createPrismaMock();
      prisma.entryItem.findUnique.mockResolvedValueOnce(
        makeItem({ entry: { id: 'entry-1', eventId: 'event-1', status } }),
      );

      await expect(
        assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
          entryItemId: 1,
          cardNumber: 111,
        }),
      ).rejects.toThrow('Cannot assign a rental chip to this entry order anymore.');
    },
  );

  it('rejects a card that is not part of the rental inventory', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem());
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce(null);

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).rejects.toThrow('This card is not available in the rental inventory.');
  });

  it('rejects an inactive or already-returned card', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem());
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({
      active: false,
      returned: false,
    });

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).rejects.toThrow('This card is not available in the rental inventory.');
  });

  it('rejects a card already locked by a competitor or another entry', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(makeItem());
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({
      active: true,
      returned: false,
    });
    prisma.competitor.findMany.mockResolvedValueOnce([{ card: 111 }]);

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).rejects.toThrow('This card is already assigned to another competitor or entry.');

    expect(prisma.entryItem.update).not.toHaveBeenCalled();
  });

  it('throws when the entry item does not exist', async () => {
    const prisma = createPrismaMock();
    prisma.entryItem.findUnique.mockResolvedValueOnce(null);

    await expect(
      assignEntryItemRentalCardForGraphQL(prisma as never, auth, {
        entryItemId: 1,
        cardNumber: 111,
      }),
    ).rejects.toThrow('Entry item 1 does not exist.');
  });
});
