import { describe, expect, it, vi } from 'vitest';

import {
  listAvailableEventPaymentMethods,
  listEventPaymentMethods,
  updateEventPaymentMethods,
} from '../event-payment-methods.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;

function createPrismaMock(
  eventOverrides: Partial<{
    authorId: number | null;
    ofeedPaymentAvailable: boolean;
    bankAccountIban: string | null;
    bankAccountName: string | null;
    paymentMethods: unknown[];
  }> = {},
) {
  const event = {
    id: 'event-1',
    authorId: 7,
    ofeedPaymentAvailable: false,
    bankAccountIban: null,
    bankAccountName: null,
    paymentMethods: [],
    ...eventOverrides,
  };
  const transaction = {
    eventPaymentMethod: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
  };

  return {
    user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
    event: { findUnique: vi.fn().mockResolvedValue(event) },
    eventPaymentMethod: transaction.eventPaymentMethod,
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
}

const validInput: Parameters<typeof updateEventPaymentMethods>[3] = {
  paymentMethods: [
    { type: 'OFEED_PAYMENT', enabled: false, position: 0 },
    {
      type: 'CUSTOM_PAYMENT_LINK',
      enabled: true,
      position: 1,
      displayName: ' Online payment ',
      paymentLinkTemplate: ' https://pay.example/#amount#/#paymentreference# ',
    },
    { type: 'QR_PAYMENT', enabled: false, position: 2 },
    { type: 'CASH', enabled: true, position: 3 },
  ],
};

describe('event payment methods', () => {
  it('returns only ready methods for public checkout in organizer-defined order', async () => {
    const prisma = createPrismaMock({
      bankAccountIban: 'CZ6508000000192000145399',
      paymentMethods: [
        { type: 'CASH', enabled: true, position: 2, displayName: null, paymentLinkTemplate: null },
        {
          type: 'CUSTOM_PAYMENT_LINK',
          enabled: true,
          position: 1,
          displayName: 'Trisbee',
          paymentLinkTemplate: 'https://pay.example/#amount#',
        },
        { type: 'OFEED_PAYMENT', enabled: true, position: 0, displayName: null, paymentLinkTemplate: null },
      ],
    });

    await expect(listAvailableEventPaymentMethods(prisma as never, 'event-1')).resolves.toEqual([
      { type: 'CUSTOM_PAYMENT_LINK', displayName: 'Trisbee' },
      { type: 'CASH', displayName: null },
    ]);
  });

  it('loads event capabilities and supplies defaults for an existing event', async () => {
    const prisma = createPrismaMock({
      ofeedPaymentAvailable: true,
      bankAccountIban: 'CZ6508000000192000145399',
      bankAccountName: 'Orienteering Club',
    });

    const result = await listEventPaymentMethods(prisma as never, auth, 'event-1');

    expect(result.paymentCapabilities).toEqual({
      ofeedPaymentAvailable: true,
      qrPaymentAvailable: true,
      bankAccountDisplay: 'Orienteering Club - CZ6508000000192000145399',
      bankAccountIban: 'CZ6508000000192000145399',
      bankAccountName: 'Orienteering Club',
    });
    expect(result.paymentMethods).toHaveLength(4);
    expect(result.paymentMethods.map((method) => method.type)).toEqual([
      'OFEED_PAYMENT',
      'CUSTOM_PAYMENT_LINK',
      'QR_PAYMENT',
      'CASH',
    ]);
    expect(result.paymentMethods.at(-1)).toMatchObject({
      type: 'CASH',
      enabled: true,
      status: 'READY',
    });
  });

  it('atomically replaces the complete configuration and normalizes custom fields', async () => {
    const prisma = createPrismaMock();

    await updateEventPaymentMethods(prisma as never, auth, 'event-1', validInput);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.eventPaymentMethod.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
    expect(prisma.eventPaymentMethod.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: 'CUSTOM_PAYMENT_LINK',
          displayName: 'Online payment',
          paymentLinkTemplate: 'https://pay.example/#amount#/#paymentreference#',
        }),
        expect.objectContaining({ type: 'CASH', displayName: null, paymentLinkTemplate: null }),
      ]),
    });
  });

  it('rejects an invalid payment URL before opening a transaction', async () => {
    const prisma = createPrismaMock();
    const input = {
      ...validInput,
      paymentMethods: validInput.paymentMethods.map((method) =>
        method.type === 'CUSTOM_PAYMENT_LINK'
          ? { ...method, paymentLinkTemplate: 'http://pay.example/#unknownvariable#' }
          : method,
      ),
    };

    await expect(
      updateEventPaymentMethods(prisma as never, auth, 'event-1', input),
    ).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects QR Payment when the event has no bank account', async () => {
    const prisma = createPrismaMock();
    const input = {
      ...validInput,
      paymentMethods: validInput.paymentMethods.map((method) =>
        method.type === 'QR_PAYMENT' ? { ...method, enabled: true } : method,
      ),
    };

    await expect(
      updateEventPaymentMethods(prisma as never, auth, 'event-1', input),
    ).rejects.toThrow('A bank account is required');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('enforces event-management permission on the server', async () => {
    const prisma = createPrismaMock({ authorId: 99 });

    await expect(
      updateEventPaymentMethods(prisma as never, auth, 'event-1', validInput),
    ).rejects.toThrow('Not authorized for this event');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not continue when an atomic database write fails', async () => {
    const prisma = createPrismaMock();
    prisma.eventPaymentMethod.createMany.mockRejectedValueOnce(new Error('database failure'));

    await expect(
      updateEventPaymentMethods(prisma as never, auth, 'event-1', validInput),
    ).rejects.toThrow('database failure');
    expect(prisma.eventPaymentMethod.deleteMany).toHaveBeenCalledTimes(1);
  });
});
