import { describe, expect, it, vi } from 'vitest';

import { updateEntryOrderPaid, updateEntryOrderStatus } from '../entry.service.js';

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
    userId: null,
    contactEmail: 'a@b.cz',
    contactFirstname: 'Jan',
    contactLastname: 'Novak',
    totalAmount: decimal(100),
    currency: 'CZK',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    items: [
      {
        id: 1,
        classId: 10,
        class: { name: 'H21' },
        firstname: 'Jan',
        lastname: 'Novak',
        registration: 'CHC9501',
        birthYear: null,
        organisation: null,
        license: null,
        card: 111,
        cardRental: false,
        startTime: null,
        fee: decimal(100),
        cardRentalFee: null,
        competitorId: null,
        actionKey: 'NEW_ENTRY',
        previousValue: null,
      },
    ],
    ...overrides,
  };
}

function createPrismaMock() {
  return {
    entry: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('updateEntryOrderStatus', () => {
  it('rejects approving an order with an item missing a card', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(
      makeEntryRow({
        items: [{ card: null, cardRental: true }],
      }),
    );

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'APPROVED',
      }),
    ).rejects.toThrow('Cannot approve an entry order until every item has a card assigned.');

    expect(prisma.entry.update).not.toHaveBeenCalled();
  });

  it('approves an order once every item has a card', async () => {
    const prisma = createPrismaMock();
    const row = makeEntryRow();
    prisma.entry.findFirst.mockResolvedValueOnce(row);
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'APPROVED' }));

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'APPROVED',
      }),
    ).resolves.toMatchObject({ status: 'APPROVED' });

    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: expect.objectContaining({ status: 'APPROVED' }),
      }),
    );
  });

  it('does not check for a card when moving to a rejected status', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(
      makeEntryRow({ status: 'RECEIVED', items: [{ card: null, cardRental: true }] }),
    );
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'REJECTED' }));

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'REJECTED',
      }),
    ).resolves.toMatchObject({ status: 'REJECTED' });
  });

  it('updates the paid flag and records the payment audit entry without changing lifecycle status', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce({ id: 'entry-1' });
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ paid: true }));

    await expect(
      updateEntryOrderPaid(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        paid: true,
        changedById: 7,
      }),
    ).resolves.toMatchObject({ status: 'RECEIVED', paid: true });

    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'entry-1' },
        data: {
          paid: true,
          statusHistory: {
            create: { status: null, paymentState: true, changedById: 7 },
          },
        },
      }),
    );
  });

  it('records an explicit unpaid audit entry when the paid flag is removed', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce({ id: 'entry-1' });
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ paid: false }));

    await updateEntryOrderPaid(prisma as never, {
      eventId: 'event-1',
      entryId: 'entry-1',
      paid: false,
      changedById: 7,
    });

    expect(prisma.entry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          paid: false,
          statusHistory: {
            create: { status: null, paymentState: false, changedById: 7 },
          },
        },
      }),
    );
  });

  it('rejects changing the status of a processed entry order', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(makeEntryRow({ status: 'PROCESSED' }));

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'APPROVED',
      }),
    ).rejects.toThrow('This entry order can no longer change status.');
  });

  it.each(['RECEIVED', 'APPROVED'] as const)('rejects an order from %s', async (status) => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(makeEntryRow({ status }));
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'REJECTED' }));

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'REJECTED',
      }),
    ).resolves.toMatchObject({ status: 'REJECTED' });
  });

  it.each(['RECEIVED', 'APPROVED'] as const)('cancels an order from %s', async (status) => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(makeEntryRow({ status }));
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'CANCELLED' }));

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'CANCELLED',
      }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it.each(['REJECTED', 'CANCELLED'] as const)(
    'rejects further status changes once already %s',
    async (status) => {
      const prisma = createPrismaMock();
      prisma.entry.findFirst.mockResolvedValueOnce(makeEntryRow({ status }));

      await expect(
        updateEntryOrderStatus(prisma as never, {
          eventId: 'event-1',
          entryId: 'entry-1',
          status: 'CANCELLED',
        }),
      ).rejects.toThrow('This entry order can no longer change status.');

      expect(prisma.entry.update).not.toHaveBeenCalled();
    },
  );

  it('does not require a card when rejecting or cancelling', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(
      makeEntryRow({ items: [{ card: null, cardRental: true }] }),
    );
    prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status: 'CANCELLED' }));

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'CANCELLED',
      }),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
  });

  it.each(['REJECTED', 'CANCELLED'] as const)(
    'releases assigned rental cards when an order is %s',
    async (status) => {
      const prisma = createPrismaMock();
      prisma.entry.findFirst.mockResolvedValueOnce(
        makeEntryRow({ items: [{ card: 123456, cardRental: true }] }),
      );
      prisma.entry.update.mockResolvedValueOnce(makeEntryRow({ status }));

      await updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status,
      });

      expect(prisma.entry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              updateMany: {
                where: { cardRental: true, card: { not: null } },
                data: { card: null },
              },
            },
          }),
        }),
      );
    },
  );

  it('throws when the entry order does not exist for this event', async () => {
    const prisma = createPrismaMock();
    prisma.entry.findFirst.mockResolvedValueOnce(null);

    await expect(
      updateEntryOrderStatus(prisma as never, {
        eventId: 'event-1',
        entryId: 'entry-1',
        status: 'APPROVED',
      }),
    ).rejects.toThrow('Entry order entry-1 does not exist for this event.');
  });
});
