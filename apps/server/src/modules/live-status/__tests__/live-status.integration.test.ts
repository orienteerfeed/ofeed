import { registerExternalDevice } from '../live-status.external.js';
import { ingestYarocPunches } from '../../punch/punch.service.js';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';
import {
  authorizeLive,
  deviceHistory,
  ingestHeartbeat,
  registerDevice,
  snapshot,
} from '../live-status.service.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { graphql } = createRequire(require.resolve('@pothos/core'))(
  'graphql',
) as typeof import('graphql');
import { schema } from '../../../graphql/schema.js';
const url = process.env.LIVE_STATUS_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.pathname !== '/ofeed_live_test'
  )
    throw new Error('Use only disposable local ofeed_live_test');
}
describe.skipIf(!url)('live status on disposable MariaDB', () => {
  const db = createPrismaClient(url ?? 'mysql://root@127.0.0.1:13389/ofeed_live_test');
  afterAll(() => db.$disconnect());
  it('serializes duplicate heartbeats, records history, and enforces event access', async () => {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@live.invalid`,
        firstname: 'Live',
        lastname: 'Test',
        password: 'test-only',
      },
    });
    const sport = await db.sport.create({ data: { name: `live-${randomUUID()}` } });
    const currency = await db.currency.upsert({
      where: { iso4217Alpha3: 'ZZZ' },
      create: { name: 'Test', iso4217Alpha3: 'ZZZ' },
      update: {},
    });
    const event = await db.event.create({
      data: {
        name: 'Telemetry test',
        date: new Date(),
        authorId: user.id,
        sportId: sport.id,
        currencyId: currency.id,
      },
    });
    try {
      await db.liveMonitoring.create({
        data: {
          eventId: event.id,
          startedAt: new Date(Date.now() - 3600_000),
          until: new Date(Date.now() + 3600_000),
        },
      });
      const appIdentity = { sourceType: 'quickevent', sourceId: randomUUID() };
      const appAuth = {
        isAuthenticated: true,
        type: 'eventBasic' as const,
        eventId: event.id,
        userId: user.id,
      };
      const registrations = await Promise.all([
        registerExternalDevice(db, appAuth, event.id, appIdentity),
        registerExternalDevice(db, appAuth, event.id, appIdentity),
      ]);
      expect(registrations[0].id).toBe(registrations[1].id);
      expect(
        await db.liveDevice.count({ where: { eventId: event.id, sourceType: 'quickevent' } }),
      ).toBe(1);
      await db.event.update({
        where: { id: event.id },
        data: { yarocSettings: { hours: 24, checkCode: 5, startCode: 6, finishCode: 7 } },
      });
      expect((await snapshot(db, event.id)).yarocSettings.checkCode).toBe(5);
      const { device, token } = await registerDevice(db, event.id, {
        name: 'radio',
        sourceType: 'yaroc',
        macAddress: 'deadbeef1234',
        intervalSeconds: 60,
      });
      expect(device.tokenHash).not.toBe(token);
      const input = {
        version: 1 as const,
        messageId: randomUUID(),
        measuredAt: new Date().toISOString(),
        metrics: { batteryPercent: 0, gsmRsrpDbm: -95 },
      };
      const results = await Promise.all([
        ingestHeartbeat(db, device.id, input),
        ingestHeartbeat(db, device.id, input),
      ]);
      expect(results.filter((r) => r.duplicate)).toHaveLength(1);
      const samples = await db.liveDeviceSample.findMany({ where: { deviceId: device.id } });
      expect(samples).toHaveLength(1);
      expect(samples[0].count).toBe(1);
      expect((await snapshot(db, event.id)).devices.find((d) => d.id === device.id)).toMatchObject({
        batteryPercent: 0,
        status: 'online',
      });
      await db.yarocSession.create({
        data: {
          eventId: event.id,
          authorId: user.id,
          until: new Date(Date.now() + 3600_000),
          settings: { hours: 1, checkCode: 3, startCode: 1, finishCode: 2 },
          state: 'running',
          owner: 'worker-a',
          generation: 2,
          leaseUntil: new Date(Date.now() + 30_000),
        },
      });
      const punch = {
        source: 'SRR' as const,
        deviceId: `yaroc:${device.id}`,
        punches: [
          {
            clientPunchId: randomUUID(),
            card: 123456,
            controlCode: 31,
            punchTime: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
          },
        ],
      };
      await expect(ingestYarocPunches(db, event.id, 'worker-a', 1, punch)).rejects.toThrow(
        'lease lost',
      );
      expect(await db.punch.count({ where: { eventId: event.id } })).toBe(0);
      await ingestYarocPunches(db, event.id, 'worker-a', 2, punch);
      await ingestYarocPunches(db, event.id, 'worker-a', 2, {
        ...punch,
        punches: [{ ...punch.punches[0], receivedAt: new Date(Date.now() + 5000).toISOString() }],
      });
      expect(await db.punchReceipt.count({ where: { eventId: event.id } })).toBe(1);
      await db.yarocSession.update({
        where: { eventId: event.id },
        data: { owner: 'worker-b', generation: 3 },
      });
      await expect(ingestYarocPunches(db, event.id, 'worker-a', 2, punch)).rejects.toThrow(
        'lease lost',
      );
      const before = await db.liveDevice.findUniqueOrThrow({ where: { id: device.id } });
      await ingestHeartbeat(db, device.id, {
        ...input,
        messageId: randomUUID(),
        measuredAt: new Date(Date.now() - 600_000).toISOString(),
        metrics: { batteryPercent: 80 },
      });
      const after = await db.liveDevice.findUniqueOrThrow({ where: { id: device.id } });
      expect(after.lastSeenAt).toEqual(before.lastSeenAt);
      expect(after.metrics).toEqual(before.metrics);
      await expect(
        deviceHistory(
          db,
          'other-event',
          device.id,
          new Date(Date.now() - 3600_000).toISOString(),
          new Date().toISOString(),
        ),
      ).rejects.toThrow('not found');
      await expect(
        authorizeLive(
          db,
          { isAuthenticated: true, type: 'jwt', userId: user.id + 999999 },
          event.id,
        ),
      ).rejects.toThrow();
      const denied = await graphql({
        schema,
        source:
          'query($eventId: String!) { eventLiveStatus(eventId: $eventId) { devices { name } } }',
        variableValues: { eventId: event.id },
        contextValue: { prisma: db, auth: { isAuthenticated: false, type: null } },
      });
      expect(denied.errors).toHaveLength(1);
      await db.liveDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
      await expect(
        ingestHeartbeat(db, device.id, { ...input, messageId: randomUUID() }),
      ).rejects.toThrow('revoked');
    } finally {
      await db.event.delete({ where: { id: event.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.sport.delete({ where: { id: sport.id } });
    }
  });
});
