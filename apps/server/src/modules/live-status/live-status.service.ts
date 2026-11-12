import { yarocNativeAvailable } from '../yaroc/yaroc.native.js';
import { brokerProfiles } from '../yaroc/yaroc.config.js';
import { heartbeats } from './live-status.metrics.js';
import { createHash, randomBytes } from 'node:crypto';
import {
  heartbeatSchema,
  yarocSettingsSchema,
  liveConnectionStatus,
  liveMetricsSchema,
  registerLiveDeviceSchema,
  type Heartbeat,
  type LiveMetrics,
} from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { AuthzAuthContext } from '../../utils/authz.js';
import { AuthzError, requireEventOwnerOrAdmin } from '../../utils/authz.js';
import { notifyLiveStatus, cachedTelemetry } from './live-status.bus.js';

export function currentMetrics(value: unknown): LiveMetrics {
  const metrics = liveMetricsSchema.parse(value);
  if (metrics.positionAt && Date.parse(metrics.positionAt) < Date.now() - 30 * 86400_000) {
    delete metrics.latitude;
    delete metrics.longitude;
    delete metrics.positionAt;
    delete metrics.accuracyMeters;
  }
  return metrics;
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function authorizeLive(
  db: AppPrismaClient,
  auth: AuthzAuthContext | undefined,
  eventId: string,
) {
  if (auth?.type !== 'jwt') throw new AuthzError('User JWT required', 401);
  return requireEventOwnerOrAdmin(db, auth, eventId);
}
export async function registerDevice(db: AppPrismaClient, eventId: string, input: unknown) {
  const data = registerLiveDeviceSchema.parse(input);
  const token = randomBytes(32).toString('base64url');
  const device = await db.liveDevice.create({
    data: { ...data, eventId, metrics: {}, tokenHash: tokenHash(token) },
  });
  return { device, token };
}
export async function snapshot(db: AppPrismaClient, eventId: string) {
  const [devices, monitoring, session, event, yarocAvailable] = await Promise.all([
    db.liveDevice.findMany({
      where: { eventId },
      orderBy: { name: 'asc' },
      omit: { metrics: true },
    }),
    db.liveMonitoring.findUnique({ where: { eventId } }),
    db.yarocSession.findUnique({ where: { eventId } }),
    db.event.findUniqueOrThrow({ where: { id: eventId }, select: { yarocSettings: true } }),
    yarocNativeAvailable(),
  ]);
  return {
    yarocSettings: yarocSettingsSchema.parse(
      event.yarocSettings ?? { checkCode: 3, startCode: 1, finishCode: 2 },
    ),
    yarocAvailable,
    sessionUntil: session?.until.toISOString() ?? null,
    brokerProfiles: Object.keys(brokerProfiles()),
    monitoringStartedAt: monitoring?.startedAt.toISOString() ?? null,
    monitoringUntil: monitoring?.until.toISOString() ?? null,
    sessionState: session?.state ?? 'stopped',
    sessionError: session?.error ?? null,
    devices: await Promise.all(
      devices.map(async (d) => {
        const metrics = await cachedTelemetry(eventId, d.id, d.version, () =>
          db.liveDevice.findUniqueOrThrow({
            where: { id: d.id },
            select: { metrics: true, version: true },
          }),
        );
        return {
          id: d.id,
          name: d.name,
          revoked: d.revokedAt !== null,
          sourceType: d.sourceType,
          macAddress: d.macAddress,
          intervalSeconds: d.intervalSeconds,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          status: d.revokedAt
            ? 'stopped'
            : liveConnectionStatus(
                d.lastSeenAt && monitoring && d.lastSeenAt >= monitoring.startedAt
                  ? d.lastSeenAt
                  : null,
                d.intervalSeconds,
                monitoring?.until ?? null,
              ),
          ...currentMetrics(metrics),
        };
      }),
    ),
  };
}
export async function ingestHeartbeat(
  db: AppPrismaClient,
  deviceId: string,
  input: Heartbeat,
  activityAt?: Date,
  fence?: { eventId: string; owner: string; generation: number },
) {
  const message = heartbeatSchema.parse(input);
  const receivedAt = new Date();
  const measuredAt = new Date(message.measuredAt);
  if (measuredAt.getTime() > receivedAt.getTime() + 60_000)
    throw new RangeError('Measurement is in the future');
  const result = await db.$transaction(async (tx) => {
    if (fence) {
      await tx.$queryRaw`SELECT eventId FROM YarocSession WHERE eventId = ${fence.eventId} FOR UPDATE`;
      const active = await tx.yarocSession.findUniqueOrThrow({ where: { eventId: fence.eventId } });
      if (
        active.owner !== fence.owner ||
        active.generation !== fence.generation ||
        active.until <= receivedAt ||
        !active.leaseUntil ||
        active.leaseUntil <= receivedAt ||
        active.state === 'stopped'
      )
        throw new Error('YAROC lease lost');
    }
    await tx.$queryRaw`SELECT id FROM LiveDevice WHERE id = ${deviceId} FOR UPDATE`;
    const device = await tx.liveDevice.findUniqueOrThrow({ where: { id: deviceId } });
    if (device.revokedAt) throw new AuthzError('Device revoked', 401);
    if (
      await tx.liveHeartbeatReceipt.findUnique({
        where: { deviceId_messageId: { deviceId, messageId: message.messageId } },
      })
    )
      return { duplicate: true, eventId: device.eventId };
    const monitoring = await tx.liveMonitoring.findUnique({ where: { eventId: device.eventId } });
    if (!monitoring || monitoring.until <= receivedAt)
      throw new AuthzError('Monitoring is not active', 409);
    await tx.liveHeartbeatReceipt.create({
      data: { deviceId, messageId: message.messageId, receivedAt },
    });
    const fresh = !device.measuredAt || measuredAt > device.measuredAt;
    // Receipt time is transport metadata, not proof of current device activity.
    // Clamp the tolerated producer clock skew so it cannot extend availability.
    const seenAt = activityAt ?? new Date(Math.min(+measuredAt, +receivedAt));
    const nextSeen =
      fresh && (!device.lastSeenAt || seenAt > device.lastSeenAt) ? seenAt : device.lastSeenAt;
    if (seenAt > receivedAt) throw new RangeError('Activity is in the future');
    if (fresh) {
      if (
        device.lastSeenAt &&
        device.lastSeenAt >= monitoring.startedAt &&
        nextSeen &&
        +nextSeen - +device.lastSeenAt > device.intervalSeconds * 4000
      ) {
        const gapStart =
          monitoring.checkedAt && monitoring.checkedAt > monitoring.startedAt
            ? monitoring.checkedAt
            : monitoring.startedAt;
        const unknown = +nextSeen - +gapStart > 15_000;
        const startedAt = unknown
          ? gapStart
          : new Date(+device.lastSeenAt + device.intervalSeconds * 4000);
        await tx.liveDeviceOutage.upsert({
          where: { deviceId_startedAt: { deviceId, startedAt } },
          create: { deviceId, startedAt, endedAt: nextSeen, kind: unknown ? 'unknown' : 'offline' },
          update: { endedAt: nextSeen },
        });
      }
      await tx.liveDevice.update({
        where: { id: deviceId },
        data: {
          lastSeenAt: nextSeen,
          measuredAt,
          metrics: { ...currentMetrics(device.metrics), ...message.metrics },
          version: { increment: 1 },
        },
      });
      if (nextSeen && (!device.lastSeenAt || nextSeen > device.lastSeenAt))
        await tx.liveDeviceOutage.updateMany({
          where: { deviceId, endedAt: null, startedAt: { lte: nextSeen } },
          data: { endedAt: nextSeen },
        });
    }
    if (!fresh && message.metrics.lastPunchAt) {
      const previous = currentMetrics(device.metrics);
      if (
        !previous.lastPunchAt ||
        Date.parse(message.metrics.lastPunchAt) > Date.parse(previous.lastPunchAt)
      ) {
        await tx.liveDevice.update({
          where: { id: deviceId },
          data: {
            metrics: { ...previous, lastPunchAt: message.metrics.lastPunchAt },
            version: { increment: 1 },
          },
        });
      }
    }
    const minute = new Date(Math.floor(measuredAt.getTime() / 60_000) * 60_000);
    if (minute.getTime() >= receivedAt.getTime() - 30 * 86400_000) {
      const previous = await tx.liveDeviceSample.findUnique({
        where: { deviceId_minute: { deviceId, minute } },
      });
      const minimum: LiveMetrics = liveMetricsSchema.parse(previous?.minimum ?? {});
      const maximum: LiveMetrics = liveMetricsSchema.parse(previous?.maximum ?? {});
      for (const [key, value] of Object.entries(message.metrics))
        if (typeof value === 'number') {
          const k = key as keyof LiveMetrics;
          Object.assign(minimum, { [k]: Math.min(Number(minimum[k] ?? value), value) });
          Object.assign(maximum, { [k]: Math.max(Number(maximum[k] ?? value), value) });
        }
      const metrics =
        !previous || measuredAt >= previous.lastAt
          ? message.metrics
          : liveMetricsSchema.parse(previous.metrics);
      await tx.liveDeviceSample.upsert({
        where: { deviceId_minute: { deviceId, minute } },
        create: {
          deviceId,
          minute,
          count: 1,
          firstAt: measuredAt,
          lastAt: measuredAt,
          metrics,
          minimum,
          maximum,
        },
        update: {
          count: { increment: 1 },
          firstAt: previous && previous.firstAt < measuredAt ? previous.firstAt : measuredAt,
          lastAt: previous && previous.lastAt > measuredAt ? previous.lastAt : measuredAt,
          maxGapMs: Math.min(
            2147483647,
            Math.max(
              previous?.maxGapMs ?? 0,
              device.measuredAt && fresh ? measuredAt.getTime() - device.measuredAt.getTime() : 0,
            ),
          ),
          metrics,
          minimum,
          maximum,
        },
      });
    }
    return { duplicate: false, eventId: device.eventId };
  });
  heartbeats.inc({ outcome: result.duplicate ? 'duplicate' : 'stored' });
  if (!result.duplicate) await notifyLiveStatus(result.eventId);
  return { duplicate: result.duplicate, receivedAt: receivedAt.toISOString() };
}
export async function deviceHistory(
  db: AppPrismaClient,
  eventId: string,
  deviceId: string,
  from: string,
  to: string,
) {
  const start = new Date(from),
    end = new Date(to);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    start > end ||
    +start < Date.now() - 30 * 86400_000 ||
    +end - +start > 30 * 86400_000
  )
    throw new Error('Invalid history range');
  const device = await db.liveDevice.findFirst({ where: { id: deviceId, eventId } });
  if (!device) throw new AuthzError('Device not found', 404);
  const [samples, outages] = await Promise.all([
    db.liveDeviceSample.findMany({
      where: { deviceId, minute: { gte: start, lte: end } },
      orderBy: { minute: 'asc' },
    }),
    db.liveDeviceOutage.findMany({
      where: {
        deviceId,
        startedAt: { lte: end },
        OR: [{ endedAt: null }, { endedAt: { gte: start } }],
      },
      orderBy: { startedAt: 'asc' },
    }),
  ]);
  return {
    samples: samples.map((s) => ({
      minute: s.minute.toISOString(),
      count: s.count,
      maxGapMs: s.maxGapMs,
      ...liveMetricsSchema.parse(s.metrics),
    })),
    outages: outages.map((o) => ({
      kind: o.kind,
      startedAt: o.startedAt.toISOString(),
      endedAt: o.endedAt?.toISOString() ?? null,
    })),
  };
}
