import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../../../generated/prisma/client.js';
import { BANK_PUSH_MAX_ATTEMPTS, deliverPendingBankPushes } from '../bank-push-delivery.js';
import { createExpoPushSender, EXPO_PUSH_SEND_URL, ExpoPushError } from '../expo-push.js';

const NOW = new Date('2026-10-28T10:00:00Z');
const TOKEN = 'ExponentPushToken[abc123]';
const notification = (patch: Record<string, unknown> = {}) => ({
  id: 'n-1',
  matchingStatus: 'MATCHED',
  attempts: 1,
  bankTransaction: {
    id: 'bt-1',
    amount: new Prisma.Decimal('1490.00'),
    currency: 'CZK',
    variableSymbol: '8200012345',
    matchedEntryId: 'entry-1',
  },
  user: { pushDevices: [{ expoPushToken: TOKEN }] },
  ...patch,
});

function mockDb() {
  return {
    bankPaymentNotification: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'n-1' }])
        .mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(notification()),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    pushDevice: { deleteMany: vi.fn() },
  };
}
let db: ReturnType<typeof mockDb>;
beforeEach(() => {
  db = mockDb();
});

describe('bank push delivery', () => {
  it('claims, sends the documented payload and marks the push sent', async () => {
    const send = vi.fn().mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);
    await deliverPendingBankPushes(db as never, send, NOW);

    expect(db.bankPaymentNotification.updateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: 'n-1', sentAt: null, attempts: { lt: BANK_PUSH_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    const [message] = send.mock.calls[0]![0];
    expect(message).toMatchObject({ to: TOKEN, title: 'Payment matched' });
    expect(message.data).toEqual({
      type: 'BANK_PAYMENT',
      transactionId: 'bt-1',
      amount: '1490.00',
      currency: 'CZK',
      status: 'MATCHED',
      entryId: 'entry-1',
    });
    expect(db.bankPaymentNotification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { sentAt: NOW, claimedUntil: null, lastErrorCode: null },
    });
  });

  it('delivers all devices in batches and maps later ticket errors to their tokens', async () => {
    const devices = Array.from({ length: 205 }, (_, i) => ({ expoPushToken: `token-${i}` }));
    db.bankPaymentNotification.findUnique.mockResolvedValue(
      notification({ user: { pushDevices: devices } }),
    );
    const send = vi.fn().mockImplementation(async (messages: { to: string }[]) => {
      expect(db.bankPaymentNotification.update).not.toHaveBeenCalled();
      return messages.map(({ to }) =>
        to === 'token-204'
          ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok' },
      );
    });
    await deliverPendingBankPushes(db as never, send, NOW);
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([100, 100, 5]);
    expect(send.mock.calls.flatMap(([batch]) => batch.map(({ to }: { to: string }) => to))).toEqual(
      devices.map(({ expoPushToken }) => expoPushToken),
    );
    expect(
      db.bankPaymentNotification.findUnique.mock.calls[0]![0].include.user.select.pushDevices,
    ).not.toHaveProperty('take');
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { expoPushToken: { in: ['token-204'] } },
    });
    expect(db.bankPaymentNotification.update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { sentAt: NOW, claimedUntil: null, lastErrorCode: 'TICKET_ERRORS_1' },
    });
  });

  it('leaves the outbox unsent when a later batch fails', async () => {
    db.bankPaymentNotification.findUnique.mockResolvedValue(
      notification({
        user: { pushDevices: Array.from({ length: 101 }, (_, i) => ({ expoPushToken: `t-${i}` })) },
      }),
    );
    const send = vi
      .fn()
      .mockResolvedValueOnce(Array.from({ length: 100 }, () => ({ status: 'ok' })))
      .mockRejectedValueOnce(new ExpoPushError('HTTP_503', true));
    await deliverPendingBankPushes(db as never, send, NOW);
    expect(db.bankPaymentNotification.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'n-1' },
      data: { lastErrorCode: 'HTTP_503', claimedUntil: new Date(NOW.getTime() + 30_000) },
    });
  });

  it('does nothing when another replica holds the claim', async () => {
    db.bankPaymentNotification.updateMany.mockResolvedValue({ count: 0 });
    const send = vi.fn();
    await deliverPendingBankPushes(db as never, send, NOW);
    expect(send).not.toHaveBeenCalled();
    expect(db.bankPaymentNotification.update).not.toHaveBeenCalled();
  });

  it('marks pushes without devices as sent', async () => {
    db.bankPaymentNotification.findUnique.mockResolvedValue(
      notification({ user: { pushDevices: [] } }),
    );
    const send = vi.fn();
    await deliverPendingBankPushes(db as never, send, NOW);
    expect(send).not.toHaveBeenCalled();
    expect(db.bankPaymentNotification.update.mock.calls[0]![0].data.lastErrorCode).toBe(
      'NO_DEVICES',
    );
  });

  it('drops unregistered device tokens', async () => {
    const send = vi
      .fn()
      .mockResolvedValue([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);
    await deliverPendingBankPushes(db as never, send, NOW);
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { expoPushToken: { in: [TOKEN] } },
    });
    expect(db.bankPaymentNotification.update.mock.calls[0]![0].data).toMatchObject({
      sentAt: NOW,
      lastErrorCode: 'TICKET_ERRORS_1',
    });
  });

  it('backs off on retryable failures and stops on permanent ones', async () => {
    await deliverPendingBankPushes(
      db as never,
      vi.fn().mockRejectedValue(new ExpoPushError('HTTP_503', true)),
      NOW,
    );
    expect(db.bankPaymentNotification.update.mock.calls[0]![0].data).toEqual({
      lastErrorCode: 'HTTP_503',
      claimedUntil: new Date(NOW.getTime() + 30_000),
    });

    db = mockDb();
    await deliverPendingBankPushes(
      db as never,
      vi.fn().mockRejectedValue(new ExpoPushError('HTTP_401', false)),
      NOW,
    );
    expect(db.bankPaymentNotification.update.mock.calls[0]![0].data).toMatchObject({
      attempts: BANK_PUSH_MAX_ATTEMPTS,
    });
  });
});

describe('Expo push sender', () => {
  const message = { to: TOKEN, title: 't', body: 'b', data: {} };

  it('posts the message array with an optional bearer token', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: { headers: Record<string, string>; body: string }) =>
        new Response(JSON.stringify({ data: [{ status: 'ok', id: 'x' }] })),
    );
    await expect(
      createExpoPushSender('expo-token', fetchImpl as never)([message]),
    ).resolves.toEqual([{ status: 'ok', id: 'x' }]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(EXPO_PUSH_SEND_URL);
    expect(init.headers.authorization).toBe('Bearer expo-token');
    expect(JSON.parse(init.body)).toEqual([message]);

    await createExpoPushSender(undefined, fetchImpl as never)([message]);
    expect(fetchImpl.mock.calls[1]![1].headers).not.toHaveProperty('authorization');
  });

  it('classifies failures', async () => {
    const reply = (status: number, body: unknown = {}) =>
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    await expect(createExpoPushSender(undefined, reply(503))([message])).rejects.toMatchObject({
      code: 'HTTP_503',
      retryable: true,
    });
    await expect(createExpoPushSender(undefined, reply(400))([message])).rejects.toMatchObject({
      code: 'HTTP_400',
      retryable: false,
    });
    await expect(
      createExpoPushSender(undefined, reply(200, { data: [] }))([message]),
    ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(
      createExpoPushSender(undefined, vi.fn().mockRejectedValue(new Error('down')))([message]),
    ).rejects.toMatchObject({ code: 'NETWORK', retryable: true });
  });
});
