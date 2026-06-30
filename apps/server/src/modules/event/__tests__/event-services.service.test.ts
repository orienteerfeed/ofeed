import { describe, expect, it, vi } from 'vitest';

import {
  deleteCustomEventServiceForGraphQL,
  listEventServiceSettings,
  saveCustomEventServiceForGraphQL,
  updateLateEntryFeePercentForGraphQL,
  updateSystemEventServiceForGraphQL,
} from '../event-services.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

function decimal(value: number) {
  return { toNumber: () => value };
}

function createPrismaMock() {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ role: 'USER' }),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue({ id: 'event-1', authorId: 7 }),
      update: vi.fn().mockResolvedValue({ id: 'event-1' }),
    },
    eventService: {
      upsert: vi.fn().mockResolvedValue({ id: 1 }),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn().mockResolvedValue({ id: 9 }),
    },
  };
}

describe('event services settings', () => {
  it('merges system defaults with stored service overrides and custom services', async () => {
    const prisma = createPrismaMock();
    prisma.event.findUnique.mockResolvedValueOnce({
      id: 'event-1',
      authorId: 7,
      lateEntryFeePercent: decimal(25),
    });
    prisma.event.findUnique.mockResolvedValueOnce({
      id: 'event-1',
      lateEntryFeePercent: decimal(25),
      services: [
        {
          id: 3,
          systemKey: 'CARD_CHANGE',
          active: true,
          name: 'Stored card change',
          description: 'Stored description',
          price: decimal(10),
          maxQuantity: null,
        },
        {
          id: 4,
          systemKey: null,
          active: true,
          name: 'Parking',
          description: 'Nearby parking',
          price: decimal(5.5),
          maxQuantity: 20,
        },
      ],
    });

    const result = await listEventServiceSettings(prisma as never, auth, 'event-1');

    expect(result.lateEntryFeePercent).toBe(25);
    expect(result.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 3,
          systemKey: 'CARD_CHANGE',
          active: true,
          name: 'Card change',
          description: 'Change of SI card number.',
          price: 10,
          custom: false,
        }),
        expect.objectContaining({
          id: null,
          systemKey: 'NAME_CHANGE',
          active: false,
          price: null,
          custom: false,
        }),
        expect.objectContaining({
          id: null,
          systemKey: 'START_TIME_CHANGE',
          active: false,
          name: 'Start time change',
          description: 'Change of competitor start time.',
          price: null,
          custom: false,
        }),
        expect.objectContaining({
          id: 4,
          systemKey: null,
          name: 'Parking',
          description: 'Nearby parking',
          price: 5.5,
          maxQuantity: 20,
          custom: true,
        }),
      ]),
    );
  });

  it('updates late-entry fee percent and accepts floating-point cent noise', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateLateEntryFeePercentForGraphQL(prisma as never, auth, 'event-1', 0.29),
    ).resolves.toEqual({ message: 'Late entry fee percent updated' });

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { lateEntryFeePercent: 0.29 },
    });
  });

  it('rejects late-entry fee percent with more than two decimals', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateLateEntryFeePercentForGraphQL(prisma as never, auth, 'event-1', 10.123),
    ).rejects.toThrow('Late entry fee percent can have at most 2 decimal places.');

    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('upserts system services with app defaults and a nullable price', async () => {
    const prisma = createPrismaMock();

    await expect(
      updateSystemEventServiceForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        systemKey: 'CARD_RENTAL',
        active: true,
        price: null,
      }),
    ).resolves.toEqual({ message: 'Event service updated' });

    expect(prisma.eventService.upsert).toHaveBeenCalledWith({
      where: { eventId_systemKey: { eventId: 'event-1', systemKey: 'CARD_RENTAL' } },
      create: {
        eventId: 'event-1',
        systemKey: 'CARD_RENTAL',
        active: true,
        name: 'Card rental',
        description: 'Rental of an SI card.',
        price: null,
        maxQuantity: null,
      },
      update: {
        active: true,
        name: 'Card rental',
        description: 'Rental of an SI card.',
        price: null,
        maxQuantity: null,
      },
    });
  });

  it('saves a custom service with normalized text and nullable max quantity', async () => {
    const prisma = createPrismaMock();
    prisma.eventService.create.mockResolvedValueOnce({
      id: 9,
      systemKey: null,
      active: true,
      name: 'Parking',
      description: 'Near finish',
      price: decimal(0.29),
      maxQuantity: null,
    });

    await expect(
      saveCustomEventServiceForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        name: ' Parking ',
        description: ' Near finish ',
        price: 0.29,
        maxQuantity: null,
      }),
    ).resolves.toEqual({
      id: 9,
      systemKey: null,
      active: true,
      name: 'Parking',
      description: 'Near finish',
      price: 0.29,
      maxQuantity: null,
      custom: true,
    });

    expect(prisma.eventService.create).toHaveBeenCalledWith({
      data: {
        eventId: 'event-1',
        systemKey: null,
        active: true,
        name: 'Parking',
        description: 'Near finish',
        price: 0.29,
        maxQuantity: null,
      },
    });
  });

  it('rejects editing a custom service from another event', async () => {
    const prisma = createPrismaMock();
    prisma.eventService.findUnique.mockResolvedValueOnce({
      eventId: 'event-2',
      systemKey: null,
    });

    await expect(
      saveCustomEventServiceForGraphQL(prisma as never, auth, {
        eventId: 'event-1',
        id: 9,
        name: 'Parking',
      }),
    ).rejects.toThrow('Custom event service not found');

    expect(prisma.eventService.update).not.toHaveBeenCalled();
  });

  it('rejects deleting a system service through the custom delete mutation', async () => {
    const prisma = createPrismaMock();
    prisma.eventService.findUnique.mockResolvedValueOnce({
      eventId: 'event-1',
      systemKey: 'CARD_CHANGE',
    });

    await expect(
      deleteCustomEventServiceForGraphQL(prisma as never, auth, 'event-1', 9),
    ).rejects.toThrow('Custom event service not found');

    expect(prisma.eventService.delete).not.toHaveBeenCalled();
  });
});
