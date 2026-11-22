import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  heartbeatSchema,
  registerLiveDeviceSchema,
  yarocSettingsSchema,
  liveConnectionStatus,
} from '@repo/shared';
import { authorizeLive, ingestHeartbeat, tokenHash, snapshot } from '../live-status.service.js';
import type { AppPrismaClient } from '../../../db/prisma-client.js';

afterEach(() => vi.useRealTimers());

const now = new Date('2026-11-10T10:00:00Z');
describe('device telemetry contracts', () => {
  it('distinguishes waiting, monitoring expiry and interval-relative outages', () => {
    const until = new Date(+now + 3600_000);
    expect(liveConnectionStatus(null, 60, until, now)).toBe('waiting');
    expect(liveConnectionStatus(new Date(+now - 120_000), 60, until, now)).toBe('online');
    expect(liveConnectionStatus(new Date(+now - 120_001), 60, until, now)).toBe('delayed');
    expect(liveConnectionStatus(new Date(+now - 240_001), 60, until, now)).toBe('offline');
    expect(liveConnectionStatus(now, 60, now, now)).toBe('stopped');
  });
  it('enforces MAC lengths per radio type and normalizes case', () => {
    expect(
      registerLiveDeviceSchema.parse({
        name: 'radio',
        sourceType: 'yaroc',
        macAddress: 'DEADBEEF1234',
      }).macAddress,
    ).toBe('deadbeef1234');
    expect(
      registerLiveDeviceSchema.safeParse({
        name: 'radio',
        sourceType: 'yaroc',
        macAddress: 'deadbeef',
      }).success,
    ).toBe(false);
    expect(
      registerLiveDeviceSchema.safeParse({
        name: 'mesh',
        sourceType: 'meshtastic',
        macAddress: 'deadbeef',
      }).success,
    ).toBe(true);
    expect(
      yarocSettingsSchema.safeParse({ checkCode: 1, startCode: 1, finishCode: 2 }).success,
    ).toBe(false);
  });
  it('retains zero battery and rejects impossible measurements', () => {
    const message = {
      version: 1,
      messageId: 'f9e5f5b0-5540-49e2-a719-6c7db9a36fed',
      measuredAt: now.toISOString(),
      metrics: { batteryPercent: 0, gsmRsrpDbm: -98, gsmSnrDb: 12 },
    };
    expect(heartbeatSchema.parse(message).metrics.batteryPercent).toBe(0);
    expect(
      heartbeatSchema.safeParse({ ...message, metrics: { batteryPercent: 101 } }).success,
    ).toBe(false);
    expect(
      heartbeatSchema.safeParse({ ...message, measuredAt: '2026-11-10T10:00:00' }).success,
    ).toBe(false);
  });
  it('never stores raw bearer tokens and rejects non-user authorization', async () => {
    expect(tokenHash('device-token')).toHaveLength(64);
    await expect(
      authorizeLive({} as AppPrismaClient, { isAuthenticated: true, type: 'eventBasic' }, 'event'),
    ).rejects.toThrow('JWT');
  });
});

function database() {
  const device = {
    id: 'device',
    eventId: 'event',
    name: 'Radio',
    sourceType: 'yaroc',
    macAddress: 'deadbeef1234',
    intervalSeconds: 60,
    revokedAt: null,
    lastSeenAt: null,
    measuredAt: null,
    metrics: {},
  };
  const tx = {
    $queryRaw: vi.fn(),
    liveDevice: { findUniqueOrThrow: vi.fn().mockResolvedValue(device), update: vi.fn() },
    liveMonitoring: {
      findUnique: vi.fn().mockResolvedValue({
        startedAt: new Date(Date.now() - 3600_000),
        until: new Date(Date.now() + 3600_000),
      }),
    },
    liveHeartbeatReceipt: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    liveDeviceSample: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    liveDeviceOutage: { updateMany: vi.fn(), upsert: vi.fn() },
  };
  const db = {
    $transaction: (fn: (v: typeof tx) => unknown) => fn(tx),
  } as unknown as AppPrismaClient;
  return { db, tx, device };
}
const message = () => ({
  version: 1 as const,
  messageId: 'f9e5f5b0-5540-49e2-a719-6c7db9a36fed',
  measuredAt: new Date().toISOString(),
  metrics: { batteryPercent: 0 },
});
describe('durable heartbeat ingest', () => {
  it('acknowledges duplicates without updating availability or samples', async () => {
    const { db, tx } = database();
    tx.liveHeartbeatReceipt.findUnique.mockResolvedValue({});
    expect((await ingestHeartbeat(db, 'device', message())).duplicate).toBe(true);
    expect(tx.liveDevice.update).not.toHaveBeenCalled();
    expect(tx.liveDeviceSample.upsert).not.toHaveBeenCalled();
  });
  it('persists the receipt and minute aggregate before acknowledging', async () => {
    const { db, tx } = database();
    const result = await ingestHeartbeat(db, 'device', message());
    expect(result.duplicate).toBe(false);
    expect(tx.liveHeartbeatReceipt.create).toHaveBeenCalledOnce();
    expect(tx.liveDeviceSample.upsert.mock.calls[0][0].create.metrics.batteryPercent).toBe(0);
    expect(tx.liveDevice.update).toHaveBeenCalledOnce();
  });
  it('does not let delayed measurements revive a device', async () => {
    const { db, tx, device } = database();
    Object.assign(device, { measuredAt: new Date(), lastSeenAt: new Date() });
    await ingestHeartbeat(db, 'device', {
      ...message(),
      measuredAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(tx.liveDevice.update).not.toHaveBeenCalled();
    expect(tx.liveDeviceSample.upsert).toHaveBeenCalledOnce();
  });
  it('keeps a queued but newer heartbeat offline instead of using its delivery time', async () => {
    vi.useFakeTimers();
    const delivery = new Date('2026-11-10T10:10:00Z');
    vi.setSystemTime(delivery);
    const { db, tx, device } = database();
    Object.assign(device, {
      measuredAt: new Date('2026-11-10T09:59:00Z'),
      lastSeenAt: new Date('2026-11-10T09:59:00Z'),
    });
    tx.liveMonitoring.findUnique.mockResolvedValue({
      startedAt: new Date('2026-11-10T09:00:00Z'),
      until: new Date('2026-11-10T11:00:00Z'),
      checkedAt: delivery,
    });
    const measuredAt = '2026-11-10T10:00:00Z';
    const result = await ingestHeartbeat(db, 'device', { ...message(), measuredAt });
    const state = tx.liveDevice.update.mock.calls[0][0].data;
    expect(state.lastSeenAt).toEqual(new Date(measuredAt));
    expect(
      liveConnectionStatus(state.lastSeenAt, 60, new Date('2026-11-10T11:00:00Z'), delivery),
    ).toBe('offline');
    expect(tx.liveDeviceSample.upsert.mock.calls[0][0].create.minute).toEqual(new Date(measuredAt));
    expect(result.receivedAt).toBe(delivery.toISOString());
  });
  it('does not mark a first delayed heartbeat online', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const { db, tx } = database();
    const measuredAt = new Date(+now - 600_000);
    await ingestHeartbeat(db, 'device', { ...message(), measuredAt: measuredAt.toISOString() });
    const state = tx.liveDevice.update.mock.calls[0][0].data;
    expect(state.lastSeenAt).toEqual(measuredAt);
    expect(liveConnectionStatus(state.lastSeenAt, 60, new Date(+now + 3600_000), now)).toBe(
      'offline',
    );
    expect(tx.liveDeviceSample.upsert).toHaveBeenCalledOnce();
  });
  it('uses explicit YAROC activity time and clamps tolerated producer clock skew', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const delayed = database();
    const activityAt = new Date(+now - 600_000);
    await ingestHeartbeat(delayed.db, 'device', message(), activityAt);
    expect(delayed.tx.liveDevice.update.mock.calls[0][0].data.lastSeenAt).toEqual(activityAt);
    const skewed = database();
    await ingestHeartbeat(skewed.db, 'device', {
      ...message(),
      measuredAt: new Date(+now + 30_000).toISOString(),
    });
    expect(skewed.tx.liveDevice.update.mock.calls[0][0].data.lastSeenAt).toEqual(now);
  });
  it('rejects revoked devices, expired monitoring and storage failures', async () => {
    const { db, tx, device } = database();
    Object.assign(device, { revokedAt: new Date() });
    await expect(ingestHeartbeat(db, 'device', message())).rejects.toThrow('revoked');
    device.revokedAt = null;
    tx.liveMonitoring.findUnique.mockResolvedValue(null);
    await expect(ingestHeartbeat(db, 'device', message())).rejects.toThrow('not active');
    tx.liveDevice.findUniqueOrThrow.mockRejectedValue(new Error('database unavailable'));
    await expect(ingestHeartbeat(db, 'device', message())).rejects.toThrow('database unavailable');
  });
});
