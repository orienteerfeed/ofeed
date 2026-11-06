import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppBindings } from '../../../types/index.js';
import router from '../devices.routes.js';
import { registerPushTokenSchema } from '../devices.schema.js';
import { getNotificationSettings, registerPushToken } from '../devices.service.js';

const DEVICE = '0d3c8f3e-2f7a-4a63-9a43-6f7d52d4f1aa';
const TOKEN = 'ExponentPushToken[abc123]';
const stored = {
  id: 'pd-1',
  userId: 7,
  deviceId: DEVICE,
  expoPushToken: TOKEN,
  platform: 'IOS',
  createdAt: new Date('2026-10-28T10:00:00Z'),
  updatedAt: new Date('2026-10-28T10:00:00Z'),
};
function mockDb() {
  const db = {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
    pushDevice: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue(stored),
    },
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ bankPushStatuses: null }),
      update: vi.fn(),
    },
  };
  return db;
}
let db: ReturnType<typeof mockDb>;
beforeEach(() => {
  db = mockDb();
});
function app(type: 'jwt' | 'eventBasic' | null = 'jwt') {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('prisma', db as never);
    if (type) c.set('authContext', { isAuthenticated: true, type, userId: 7, eventId: 'race' });
    await next();
  });
  return app.route('/devices', router);
}
const json = (method: string, value: unknown) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

describe('push token registration', () => {
  it('accepts Expo tokens only', () => {
    const input = { expoPushToken: TOKEN, platform: 'ios', deviceId: DEVICE };
    expect(registerPushTokenSchema.safeParse(input).success).toBe(true);
    for (const change of [
      { expoPushToken: 'ExpoPushToken[x]' },
      { expoPushToken: 'fcm-raw-token' },
      { platform: 'web' },
      { deviceId: 'phone' },
      { userId: 8 },
    ]) {
      const ok = registerPushTokenSchema.safeParse({ ...input, ...change }).success;
      expect(ok).toBe(change.expoPushToken === 'ExpoPushToken[x]');
    }
  });

  it('moves a token to the caller and upserts by user and device', async () => {
    await expect(
      registerPushToken(db as never, 7, {
        expoPushToken: TOKEN,
        platform: 'ios',
        deviceId: DEVICE,
      }),
    ).resolves.toEqual({
      deviceId: DEVICE,
      platform: 'ios',
      createdAt: '2026-10-28T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
    });
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { expoPushToken: TOKEN, NOT: { userId: 7, deviceId: DEVICE } },
    });
    expect(db.pushDevice.upsert.mock.calls[0]![0].where).toEqual({
      userId_deviceId: { userId: 7, deviceId: DEVICE },
    });
  });

  it('defaults every status to on and treats missing keys as on', async () => {
    await expect(getNotificationSettings(db as never, 7)).resolves.toEqual({
      bankPayment: { MATCHED: true, OVERPAID: true, UNMATCHED: true },
    });
    db.user.findUniqueOrThrow.mockResolvedValueOnce({ bankPushStatuses: { UNMATCHED: false } });
    await expect(getNotificationSettings(db as never, 7)).resolves.toEqual({
      bankPayment: { MATCHED: true, OVERPAID: true, UNMATCHED: false },
    });
  });
});

describe('devices REST adapters', () => {
  it('requires a user JWT', async () => {
    for (const type of [null, 'eventBasic'] as const) {
      expect((await app(type).request('/devices/notification-settings')).status).toBe(401);
    }
  });

  it('scopes deletion to the caller and never returns the token', async () => {
    db.pushDevice.deleteMany.mockResolvedValueOnce({ count: 1 });
    const removed = await app().request(`/devices/push-tokens/${DEVICE}`, { method: 'DELETE' });
    expect(removed.status).toBe(200);
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, deviceId: DEVICE },
    });

    const registered = await app().request(
      '/devices/push-tokens',
      json('POST', { expoPushToken: TOKEN, platform: 'ios', deviceId: DEVICE }),
    );
    expect(registered.status).toBe(200);
    expect(JSON.stringify(await registered.json())).not.toContain(TOKEN);
  });

  it('validates and stores settings', async () => {
    const settings = { bankPayment: { MATCHED: true, OVERPAID: false, UNMATCHED: true } };
    expect(
      (await app().request('/devices/notification-settings', json('PUT', settings))).status,
    ).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { bankPushStatuses: settings.bankPayment },
    });
    const partial = { bankPayment: { MATCHED: true } };
    expect(
      (await app().request('/devices/notification-settings', json('PUT', partial))).status,
    ).toBe(422);
  });
});
