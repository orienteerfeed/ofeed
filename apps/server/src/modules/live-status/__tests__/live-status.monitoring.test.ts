import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppPrismaClient } from '../../../db/prisma-client.js';
import { restartMonitoring } from '../live-status.monitoring.js';
import { startLiveMaintenance } from '../live-status.worker.js';

afterEach(() => vi.useRealTimers());
describe('monitoring window checkpoints', () => {
  it('resets the checkpoint when creating or restarting monitoring', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const db = { liveMonitoring: { upsert } } as unknown as AppPrismaClient;
    const now = new Date('2026-11-10T10:00:00Z');
    const until = new Date(+now + 3600_000);
    await restartMonitoring(db, 'event', now, until);
    const input = upsert.mock.calls[0][0];
    expect(input.create).toMatchObject({ startedAt: now, checkedAt: now, until });
    expect(input.update).toEqual({ startedAt: now, checkedAt: now, until });
  });
  it.each([false, true])(
    'ignores checkpoints before a restarted window, but retains real monitoring gaps (gap=%s)',
    async (realGap) => {
      vi.useFakeTimers();
      const now = new Date('2026-11-10T10:00:00Z');
      vi.setSystemTime(now);
      const window = {
        eventId: 'event',
        until: new Date(+now + 3600_000),
        startedAt: new Date(+now - (realGap ? 3600_000 : 1000)),
        checkedAt: new Date(+now - (realGap ? 60_000 : 86400_000)),
      };
      const upsert = vi.fn();
      const tx = {
        $queryRaw: vi.fn(),
        liveMonitoring: { findUniqueOrThrow: vi.fn().mockResolvedValue(window), update: vi.fn() },
      };
      const db = {
        $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
        liveMonitoring: { findMany: vi.fn().mockResolvedValue([window]) },
        liveDevice: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'device', lastSeenAt: now, intervalSeconds: 60 }]),
          updateMany: vi.fn(),
        },
        liveDeviceSample: { findMany: vi.fn().mockResolvedValue([]) },
        liveHeartbeatReceipt: { findMany: vi.fn().mockResolvedValue([]) },
        liveDeviceOutage: { upsert, findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as AppPrismaClient;
      const report = vi.fn();
      const stop = startLiveMaintenance(db, report);
      try {
        await vi.advanceTimersByTimeAsync(5000);
        expect(report).not.toHaveBeenCalled();
        if (realGap)
          expect(upsert).toHaveBeenCalledWith(
            expect.objectContaining({
              create: expect.objectContaining({ kind: 'unknown', startedAt: window.checkedAt }),
            }),
          );
        else expect(upsert).not.toHaveBeenCalled();
      } finally {
        await stop();
      }
    },
  );
});
