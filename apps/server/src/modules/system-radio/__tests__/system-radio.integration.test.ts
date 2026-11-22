import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';
import {
  saveSystemRadio,
  assignSystemRadio,
  archiveSystemRadio,
  configureSystemCollection,
  stopSystemCollection,
  expireSystemCollections,
} from '../system-radio.service.js';
import {
  registerDevice,
  snapshot,
  ingestHeartbeat,
} from '../../live-status/live-status.service.js';
import { changeManualLiveDevice } from '../../live-status/live-status.management.js';
import { startYarocSession, stopYarocSession } from '../../yaroc/yaroc.service.js';
import { ingestYarocPunches } from '../../punch/punch.service.js';
import { sessionWhere } from '../../yaroc/yaroc.session.js';
import { loadYaroc } from '../../yaroc/yaroc.native.js';
import { schema } from '../../../graphql/schema.js';

vi.mock('../../yaroc/yaroc.native.js', () => ({
  loadYaroc: vi.fn().mockResolvedValue({ MqttClient: class {} }),
  yarocNativeAvailable: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../live-status/live-status.bus.js', () => ({
  notifyLiveStatus: vi.fn().mockResolvedValue(undefined),
  cachedTelemetry: (_event: string, _device: string, _version: number, loader: () => unknown) =>
    loader(),
  liveBus: {},
  liveTopic: () => '',
}));
const require = createRequire(import.meta.url);
const { graphql } = createRequire(require.resolve('@pothos/core'))(
  'graphql',
) as typeof import('graphql');
const url = process.env.SYSTEM_RADIO_TEST_DATABASE_URL;
if (url) {
  const parsed = new URL(url);
  if (
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.pathname !== '/ofeed_radio_test'
  )
    throw new Error('Use only disposable local ofeed_radio_test');
}
describe.skipIf(!url)('system radios on disposable MariaDB', () => {
  const db = createPrismaClient(url ?? 'mysql://root@127.0.0.1:13405/ofeed_radio_test');
  afterAll(() => db.$disconnect());
  async function fixture() {
    const key = randomUUID();
    const admin = await db.user.create({
      data: {
        email: `${key}-admin@radio.invalid`,
        firstname: 'Admin',
        lastname: 'Radio',
        password: 'test-only',
        role: 'ADMIN',
      },
    });
    const owner = await db.user.create({
      data: {
        email: `${key}-owner@radio.invalid`,
        firstname: 'Owner',
        lastname: 'Radio',
        password: 'test-only',
      },
    });
    const sport = await db.sport.create({ data: { name: `radio-${key}` } });
    const currency = await db.currency.upsert({
      where: { iso4217Alpha3: 'ZZZ' },
      create: { name: 'Test', iso4217Alpha3: 'ZZZ' },
      update: {},
    });
    const event = async (name: string) =>
      db.event.create({
        data: {
          name,
          date: new Date(),
          timezone: 'UTC',
          authorId: owner.id,
          sportId: sport.id,
          currencyId: currency.id,
        },
      });
    const a = await event('System radio A'),
      b = await event('System radio B');
    const mac = randomUUID().replaceAll('-', '').slice(0, 12);
    const input = {
      name: `Unit ${key}`,
      sourceType: 'yaroc',
      macAddress: mac,
      intervalSeconds: 60,
      brokerProfile: 'default',
    };
    const cleanup = async () => {
      await db.event.deleteMany({ where: { id: { in: [a.id, b.id] } } });
      await db.systemRadioDevice.deleteMany({ where: { createdById: admin.id } });
      await db.user.deleteMany({ where: { id: { in: [admin.id, owner.id] } } });
      await db.sport.delete({ where: { id: sport.id } });
    };
    return { admin, owner, a, b, mac, input, cleanup };
  }
  const settings = { hours: 24, checkCode: 3, startCode: 1, finishCode: 2 };
  it('keeps histories in A when reassigning to B and rejects old workers and owner changes', async () => {
    const f = await fixture();
    try {
      const unit = await saveSystemRadio(db, f.admin.id, f.input);
      await assignSystemRadio(db, unit.id, f.a.id, f.admin.id);
      const eventDevice = await db.liveDevice.findUniqueOrThrow({
        where: { eventId_systemDeviceId: { eventId: f.a.id, systemDeviceId: unit.id } },
      });
      expect(eventDevice.tokenHash).toBeNull();
      await expect(registerDevice(db, f.b.id, { ...f.input, name: 'Manual' })).rejects.toThrow(
        'reserved',
      );
      await expect(
        changeManualLiveDevice(db, f.a.id, eventDevice.id, { revokedAt: new Date() }),
      ).rejects.toThrow('Admin zone');
      await configureSystemCollection(db, f.a.id, f.admin.id, settings, true);
      await expect(assignSystemRadio(db, unit.id, f.b.id, f.admin.id)).rejects.toThrow(
        'Stop system reception',
      );
      await expect(
        saveSystemRadio(db, f.admin.id, { ...f.input, name: 'Edited' }, unit.id),
      ).rejects.toThrow('Stop system reception');
      const until = new Date(Date.now() + 3600_000);
      await db.yarocSession.update({
        where: sessionWhere(f.a.id, 'system'),
        data: { owner: 'system-worker', leaseUntil: until, generation: 10, state: 'running' },
      });
      const batch = {
        source: 'SRR' as const,
        deviceId: `yaroc:${eventDevice.id}`,
        punches: [
          {
            clientPunchId: randomUUID(),
            card: 12345,
            controlCode: 31,
            punchTime: new Date().toISOString(),
            receivedAt: new Date().toISOString(),
          },
        ],
      };
      await ingestYarocPunches(db, f.a.id, 'system-worker', 10, batch, 'system');
      await expect(
        ingestYarocPunches(
          db,
          f.a.id,
          'system-worker',
          10,
          {
            ...batch,
            punches: [
              {
                ...batch.punches[0],
                clientPunchId: randomUUID(),
                punchTime: new Date(Date.now() - 3600_000).toISOString(),
              },
            ],
          },
          'system',
        ),
      ).rejects.toThrow('outside current');
      await ingestHeartbeat(
        db,
        eventDevice.id,
        {
          version: 1,
          messageId: randomUUID(),
          measuredAt: new Date().toISOString(),
          metrics: { batteryPercent: 80 },
        },
        undefined,
        { eventId: f.a.id, owner: 'system-worker', generation: 10, scope: 'system' },
      );
      expect((await snapshot(db, f.a.id)).devices[0]).toMatchObject({
        systemDevice: true,
        currentlyAssigned: true,
      });
      await stopSystemCollection(db, f.a.id);
      await assignSystemRadio(db, unit.id, null, f.admin.id);
      await assignSystemRadio(db, unit.id, f.b.id, f.admin.id);
      await expect(
        ingestYarocPunches(db, f.a.id, 'system-worker', 10, batch, 'system'),
      ).rejects.toThrow('lease lost');
      await expect(
        ingestHeartbeat(
          db,
          eventDevice.id,
          {
            version: 1,
            messageId: randomUUID(),
            measuredAt: new Date().toISOString(),
            metrics: {},
          },
          undefined,
          { eventId: f.a.id, owner: 'system-worker', generation: 10, scope: 'system' },
        ),
      ).rejects.toThrow('lease lost');
      expect(await db.punch.count({ where: { eventId: f.a.id } })).toBe(1);
      expect(await db.punch.count({ where: { eventId: f.b.id } })).toBe(0);
      expect(
        await db.liveDeviceSample.count({ where: { deviceId: eventDevice.id } }),
      ).toBeGreaterThan(0);
      expect((await snapshot(db, f.a.id)).devices[0]).toMatchObject({
        currentlyAssigned: false,
        revoked: true,
        status: 'stopped',
      });
      await assignSystemRadio(db, unit.id, f.a.id, f.admin.id);
      expect(
        (
          await db.liveDevice.findUniqueOrThrow({
            where: { eventId_systemDeviceId: { eventId: f.a.id, systemDeviceId: unit.id } },
          })
        ).id,
      ).toBe(eventDevice.id);
      expect(
        await db.systemRadioAssignment.count({ where: { systemDeviceId: unit.id, endedAt: null } }),
      ).toBe(1);
    } finally {
      await f.cleanup();
    }
  });
  it('serializes assignment and identity reservation across connections', async () => {
    const f = await fixture();
    const other = createPrismaClient(url!);
    try {
      const unit = await saveSystemRadio(db, f.admin.id, f.input);
      await Promise.all([
        assignSystemRadio(db, unit.id, f.a.id, f.admin.id),
        assignSystemRadio(other, unit.id, f.b.id, f.admin.id),
      ]);
      expect(
        await db.systemRadioAssignment.count({ where: { systemDeviceId: unit.id, endedAt: null } }),
      ).toBe(1);
      expect(
        await db.liveDevice.count({ where: { systemDeviceId: unit.id, revokedAt: null } }),
      ).toBe(1);
      const macAddress = randomUUID().replaceAll('-', '').slice(0, 12);
      const results = await Promise.allSettled([
        saveSystemRadio(db, f.admin.id, { ...f.input, macAddress, name: `Race ${f.admin.id}` }),
        registerDevice(other, f.a.id, { ...f.input, macAddress, name: 'Concurrent manual' }),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    } finally {
      await other.$disconnect();
      await f.cleanup();
    }
  });
  it('isolates collection scopes, preserves longer monitoring, expires and releases on event deletion', async () => {
    const f = await fixture();
    try {
      const unit = await saveSystemRadio(db, f.admin.id, f.input);
      await assignSystemRadio(db, unit.id, f.a.id, f.admin.id);
      await registerDevice(db, f.a.id, {
        ...f.input,
        name: 'Own radio',
        macAddress: randomUUID().replaceAll('-', '').slice(0, 12),
      });
      await startYarocSession(db, f.a.id, f.owner.id, { ...settings, hours: 48 });
      const before = await db.liveMonitoring.findUniqueOrThrow({ where: { eventId: f.a.id } });
      await configureSystemCollection(db, f.a.id, f.admin.id, settings, true);
      const after = await db.liveMonitoring.findUniqueOrThrow({ where: { eventId: f.a.id } });
      expect(after.until).toEqual(before.until);
      expect(after.startedAt).toEqual(before.startedAt);
      await stopYarocSession(db, f.a.id);
      expect(
        (await db.yarocSession.findUniqueOrThrow({ where: sessionWhere(f.a.id, 'system') })).state,
      ).toBe('starting');
      await startYarocSession(db, f.a.id, f.owner.id, settings);
      await stopSystemCollection(db, f.a.id);
      expect((await db.yarocSession.findUniqueOrThrow({ where: sessionWhere(f.a.id) })).state).toBe(
        'starting',
      );
      await configureSystemCollection(db, f.a.id, f.admin.id, settings, true);
      await db.yarocSession.update({
        where: sessionWhere(f.a.id, 'system'),
        data: { until: new Date(Date.now() - 1000) },
      });
      expect((await snapshot(db, f.a.id)).systemSessionState).toBe('stopped');
      const eventDevice = await db.liveDevice.findUniqueOrThrow({
        where: { eventId_systemDeviceId: { eventId: f.a.id, systemDeviceId: unit.id } },
      });
      const outage = await db.liveDeviceOutage.create({
        data: { deviceId: eventDevice.id, startedAt: new Date(Date.now() - 60_000) },
      });
      await expireSystemCollections(db, new Date());
      expect(
        (await db.liveDeviceOutage.findUniqueOrThrow({ where: { id: outage.id } })).endedAt,
      ).not.toBeNull();
      expect(
        (await db.systemRadioDevice.findUniqueOrThrow({ where: { id: unit.id } }))
          .currentAssignmentId,
      ).not.toBeNull();
      await assignSystemRadio(db, unit.id, null, f.admin.id);
      await archiveSystemRadio(db, unit.id, true, f.admin.id);
      await expect(assignSystemRadio(db, unit.id, f.b.id, f.admin.id)).rejects.toThrow('Restore');
      await archiveSystemRadio(db, unit.id, false, f.admin.id);
      await assignSystemRadio(db, unit.id, f.b.id, f.admin.id);
      await db.event.delete({ where: { id: f.b.id } });
      expect(
        (await db.systemRadioDevice.findUniqueOrThrow({ where: { id: unit.id } }))
          .currentAssignmentId,
      ).toBeNull();
    } finally {
      await f.cleanup();
    }
  });
  it('enforces admin-only GraphQL and native start failure without changing assignment', async () => {
    const f = await fixture();
    try {
      const auth = { isAuthenticated: true, type: 'jwt', userId: f.owner.id };
      const result = await graphql({
        schema,
        source: '{ adminSystemRadios { devices { id } } }',
        contextValue: { prisma: db, auth },
      });
      expect(result.errors?.[0].message).toContain('Admin access required');
      const unit = await saveSystemRadio(db, f.admin.id, f.input);
      await assignSystemRadio(db, unit.id, f.a.id, f.admin.id);
      const inventory = await graphql({
        schema,
        source: '{ adminSystemRadios { devices { id eventId collectionState lastSeenAt } } }',
        contextValue: { prisma: db, auth: { ...auth, userId: f.admin.id } },
      });
      expect(inventory.errors).toBeUndefined();
      const eventView = await graphql({
        schema,
        source:
          'query($eventId: String!) { eventLiveStatus(eventId:$eventId) { systemSessionState devices { systemDevice currentlyAssigned } } }',
        variableValues: { eventId: f.a.id },
        contextValue: { prisma: db, auth },
      });
      expect(eventView.errors).toBeUndefined();
      vi.mocked(loadYaroc).mockRejectedValueOnce(new Error('Native unavailable'));
      await expect(
        configureSystemCollection(db, f.a.id, f.admin.id, settings, true),
      ).rejects.toThrow('Native unavailable');
      expect(
        await db.yarocSession.findUnique({ where: sessionWhere(f.a.id, 'system') }),
      ).toBeNull();
      expect(
        (
          await db.systemRadioDevice.findUniqueOrThrow({
            where: { id: unit.id },
            include: { currentAssignment: true },
          })
        ).currentAssignment?.eventId,
      ).toBe(f.a.id);
      const control = await graphql({
        schema,
        source:
          'mutation($eventId: String!) { stopSystemRadioCollection(eventId:$eventId) { state } }',
        variableValues: { eventId: f.a.id },
        contextValue: { prisma: db, auth },
      });
      expect(control.errors?.[0].message).toContain('Admin access required');
    } finally {
      await f.cleanup();
    }
  });
});
