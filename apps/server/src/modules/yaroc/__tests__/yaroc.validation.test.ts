import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '../../../db/prisma-client.js';
vi.mock('../yaroc.native.js', () => ({
  loadYaroc: vi.fn().mockResolvedValue({ MqttClient: class {} }),
}));
import { loadYaroc } from '../yaroc.native.js';
import { saveYarocSettings, startYarocSession } from '../yaroc.service.js';
const settings = { hours: 24, checkCode: 3, startCode: 1, finishCode: 2 };
function database() {
  const tx = {
    $queryRaw: vi.fn(),
    event: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: 'UTC' }), update: vi.fn() },
    liveDevice: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { name: 'Radio', sourceType: 'yaroc', macAddress: 'deadbeef1234', intervalSeconds: 60 },
        ]),
    },
    yarocSession: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    liveMonitoring: { upsert: vi.fn() },
  };
  const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx));
  return { db: { $transaction: transaction } as unknown as AppPrismaClient, tx, transaction };
}
beforeEach(() => {
  vi.mocked(loadYaroc).mockClear();
});
afterEach(() => vi.useRealTimers());
describe('authoritative YAROC action validation', () => {
  it('rejects invalid configuration and unknown or prototype broker names before writing', async () => {
    const { db, tx } = database();
    for (const input of [
      { ...settings, startCode: 3 },
      { ...settings, hours: 1.5 },
      { ...settings, brokerProfile: 'toString' },
    ])
      await expect(startYarocSession(db, 'event', 1, input)).rejects.toThrow();
    expect(tx.yarocSession.upsert).not.toHaveBeenCalled();
  });
  it('rejects unavailable native reception, empty fleets and invalid DNS entries', async () => {
    const native = database();
    vi.mocked(loadYaroc).mockRejectedValueOnce(new Error('Native unavailable'));
    await expect(startYarocSession(native.db, 'event', 1, settings)).rejects.toThrow(
      'Native unavailable',
    );
    expect(native.transaction).not.toHaveBeenCalled();
    const empty = database();
    empty.tx.liveDevice.findMany.mockResolvedValue([]);
    await expect(startYarocSession(empty.db, 'event', 1, settings)).rejects.toThrow(
      'Register at least',
    );
    const invalid = database();
    invalid.tx.liveDevice.findMany.mockResolvedValue([
      { name: 'Radio', sourceType: 'yaroc', macAddress: 'bad', intervalSeconds: 60 },
    ]);
    await expect(startYarocSession(invalid.db, 'event', 1, settings)).rejects.toThrow();
    expect(invalid.tx.yarocSession.upsert).not.toHaveBeenCalled();
  });
  it('rejects DST crossings and concurrent active sessions under the event lock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T23:00:00Z'));
    const dst = database();
    dst.tx.event.findUniqueOrThrow.mockResolvedValue({ timezone: 'Europe/Prague' });
    await expect(startYarocSession(dst.db, 'event', 1, settings)).rejects.toThrow(
      'daylight-saving',
    );
    const active = database();
    active.tx.yarocSession.findUnique.mockResolvedValue({
      state: 'starting',
      until: new Date(Date.now() + 60_000),
    });
    await expect(startYarocSession(active.db, 'event', 1, settings)).rejects.toThrow(
      'already active',
    );
    expect(active.tx.$queryRaw).toHaveBeenCalled();
    expect(active.tx.yarocSession.upsert).not.toHaveBeenCalled();
  });
  it('saves valid configuration without requiring native reception and blocks active edits', async () => {
    const valid = database();
    await saveYarocSettings(valid.db, 'event', settings);
    expect(valid.tx.event.update).toHaveBeenCalledOnce();
    expect(loadYaroc).not.toHaveBeenCalled();
    const active = database();
    active.tx.yarocSession.findUnique.mockResolvedValue({
      state: 'running',
      until: new Date(Date.now() + 60_000),
    });
    await expect(saveYarocSettings(active.db, 'event', settings)).rejects.toThrow('Stop reception');
    expect(active.tx.event.update).not.toHaveBeenCalled();
  });
});
