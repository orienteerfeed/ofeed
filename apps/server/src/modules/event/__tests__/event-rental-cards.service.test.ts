import { describe, expect, it, vi } from 'vitest';

import {
  createEventRentalCardForGraphQL,
  deleteAllEventRentalCardsForGraphQL,
  deleteEventRentalCardForGraphQL,
  importEventRentalCardsFromCsv,
  listEventRentalCards,
  updateEventRentalCardReturned,
  updateEventRentalCardForGraphQL,
} from '../event-rental-cards.service.js';

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
      findMany: vi.fn().mockResolvedValue([]),
    },
    eventRentalCard: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
}

describe('event rental cards', () => {
  it('lists rental cards and marks isLent for competitor- and entry-locked numbers', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.findMany.mockResolvedValueOnce([
      { id: 1, cardNumber: 111, active: true, returned: false },
      { id: 2, cardNumber: 222, active: true, returned: false },
      { id: 3, cardNumber: 333, active: false, returned: true },
    ]);
    prisma.competitor.findMany.mockResolvedValueOnce([{ card: 111 }]);
    prisma.entryItem.findMany.mockResolvedValueOnce([{ card: 222 }]);

    const result = await listEventRentalCards(prisma as never, auth, 'event-1');

    expect(result).toEqual([
      { id: 1, cardNumber: 111, active: true, returned: false, isLent: true },
      { id: 2, cardNumber: 222, active: true, returned: false, isLent: true },
      { id: 3, cardNumber: 333, active: false, returned: true, isLent: false },
    ]);
    expect(prisma.entryItem.findMany).toHaveBeenCalledWith({
      where: {
        cardRental: true,
        card: { not: null },
        entry: {
          eventId: 'event-1',
          status: { in: ['RECEIVED', 'APPROVED'] },
        },
      },
      select: { card: true },
    });
  });

  it('creates a rental card', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.create.mockResolvedValueOnce({
      id: 5,
      cardNumber: 444,
      active: true,
      returned: false,
    });

    await expect(
      createEventRentalCardForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        cardNumber: 444,
      }),
    ).resolves.toEqual({ id: 5, cardNumber: 444, active: true, returned: false, isLent: false });
  });

  it('rejects a non-positive card number', async () => {
    const prisma = createPrismaMock();

    await expect(
      createEventRentalCardForGraphQL(prisma as never, auth, { eventId: 'event-1', cardNumber: 0 }),
    ).rejects.toThrow('Card number must be a positive integer.');

    expect(prisma.eventRentalCard.create).not.toHaveBeenCalled();
  });

  it('translates a unique constraint violation into a validation error', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      createEventRentalCardForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        cardNumber: 444,
      }),
    ).rejects.toThrow('Card number already exists for this event.');
  });

  it('rejects updating a rental card from another event', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({ eventId: 'event-2' });

    await expect(
      updateEventRentalCardForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        id: 9,
        returned: true,
      }),
    ).rejects.toThrow('Rental card not found');

    expect(prisma.eventRentalCard.update).not.toHaveBeenCalled();
  });

  it('updates active/returned flags', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({ eventId: 'event-1' });
    prisma.eventRentalCard.update.mockResolvedValueOnce({
      id: 9,
      cardNumber: 555,
      active: false,
      returned: true,
    });

    await expect(
      updateEventRentalCardForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        id: 9,
        active: false,
        returned: true,
      }),
    ).resolves.toEqual({ id: 9, cardNumber: 555, active: false, returned: true, isLent: false });

    expect(prisma.eventRentalCard.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { active: false, returned: true },
    });
  });

  it('updates returned status by event and card number', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({ id: 9 });
    prisma.eventRentalCard.update.mockResolvedValueOnce({
      id: 9,
      cardNumber: 555,
      active: true,
      returned: true,
    });

    await expect(
      updateEventRentalCardReturned(prisma as never, auth, {
        eventId: 'event-1',
        cardNumber: 555,
        returned: true,
      }),
    ).resolves.toEqual({ id: 9, cardNumber: 555, active: true, returned: true, isLent: false });

    expect(prisma.eventRentalCard.findUnique).toHaveBeenCalledWith({
      where: { eventId_cardNumber: { eventId: 'event-1', cardNumber: 555 } },
      select: { id: true },
    });
    expect(prisma.eventRentalCard.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { returned: true },
    });
  });

  it('deletes a rental card scoped to its event', async () => {
    const prisma = createPrismaMock();
    prisma.eventRentalCard.findUnique.mockResolvedValueOnce({ eventId: 'event-1' });

    await expect(
      deleteEventRentalCardForGraphQL(prisma as never, auth, 'event-1', 9),
    ).resolves.toEqual({ message: 'Rental card deleted' });

    expect(prisma.eventRentalCard.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it('deletes all rental cards scoped to the event', async () => {
    const prisma = createPrismaMock();

    await expect(
      deleteAllEventRentalCardsForGraphQL(prisma as never, auth, 'event-1'),
    ).resolves.toEqual({ message: 'Rental cards deleted' });

    expect(prisma.eventRentalCard.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
  });

  it('does not delete all rental cards for a non-owner user', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique.mockResolvedValueOnce({ id: 'event-1', authorId: 99 });

    await expect(
      deleteAllEventRentalCardsForGraphQL(prisma as never, auth, 'event-1'),
    ).rejects.toThrow();

    expect(prisma.eventRentalCard.deleteMany).not.toHaveBeenCalled();
  });

  it('imports rental cards from a CSV file', async () => {
    const prisma = createPrismaMock();
    const csv = 'cardNumber,active\n111,true\n222,false\n333,\n';

    await expect(
      importEventRentalCardsFromCsv(prisma as never, auth, 'event-1', csv),
    ).resolves.toEqual({ imported: 3 });

    expect(prisma.eventRentalCard.upsert).toHaveBeenCalledWith({
      where: { eventId_cardNumber: { eventId: 'event-1', cardNumber: 111 } },
      create: { eventId: 'event-1', cardNumber: 111, active: true },
      update: { active: true },
    });
    expect(prisma.eventRentalCard.upsert).toHaveBeenCalledWith({
      where: { eventId_cardNumber: { eventId: 'event-1', cardNumber: 222 } },
      create: { eventId: 'event-1', cardNumber: 222, active: false },
      update: { active: false },
    });
    expect(prisma.eventRentalCard.upsert).toHaveBeenCalledWith({
      where: { eventId_cardNumber: { eventId: 'event-1', cardNumber: 333 } },
      create: { eventId: 'event-1', cardNumber: 333, active: true },
      update: { active: true },
    });
  });

  it('rejects a CSV file with duplicate card numbers', async () => {
    const prisma = createPrismaMock();
    const csv = 'cardNumber\n111\n111\n';

    await expect(
      importEventRentalCardsFromCsv(prisma as never, auth, 'event-1', csv),
    ).rejects.toThrow('Duplicate card numbers in file: 111.');

    expect(prisma.eventRentalCard.upsert).not.toHaveBeenCalled();
  });

  it('rejects a CSV file with a non-numeric card number', async () => {
    const prisma = createPrismaMock();
    const csv = 'cardNumber\nabc\n';

    await expect(
      importEventRentalCardsFromCsv(prisma as never, auth, 'event-1', csv),
    ).rejects.toThrow('"abc" is not a valid card number.');
  });
});
