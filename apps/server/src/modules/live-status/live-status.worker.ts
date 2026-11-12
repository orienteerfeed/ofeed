import type { AppPrismaClient } from '../../db/prisma-client.js';
import { notifyLiveStatus } from './live-status.bus.js';
export function startLiveMaintenance(db: AppPrismaClient, report: (error: unknown) => void) {
  let busy = false,
    nextCleanup = 0;
  let closed = false;
  const tick = async () => {
    if (busy || closed) return;
    busy = true;
    try {
      const now = new Date();
      const monitoring = await db.liveMonitoring.findMany({ where: { until: { gt: now } } });
      for (const m of monitoring) {
        const previous = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT eventId FROM LiveMonitoring WHERE eventId = ${m.eventId} FOR UPDATE`;
          const value = await tx.liveMonitoring.findUniqueOrThrow({
            where: { eventId: m.eventId },
          });
          await tx.liveMonitoring.update({
            where: { eventId: m.eventId },
            data: { checkedAt: now },
          });
          // Also protect windows created before checkpoint resets were introduced.
          return value.checkedAt && value.checkedAt > value.startedAt
            ? value.checkedAt
            : value.startedAt;
        });
        const unknown = +now - +previous > 15_000;
        const devices = await db.liveDevice.findMany({
          where: { eventId: m.eventId, revokedAt: null, lastSeenAt: { not: null } },
        });
        if (unknown)
          for (const d of devices) {
            await db.liveDeviceOutage.upsert({
              where: { deviceId_startedAt: { deviceId: d.id, startedAt: previous } },
              create: { deviceId: d.id, startedAt: previous, endedAt: now, kind: 'unknown' },
              update: { endedAt: now },
            });
          }
        for (const d of devices)
          if (
            d.lastSeenAt &&
            +now - +d.lastSeenAt > d.intervalSeconds * 4000 &&
            d.lastSeenAt >= m.startedAt
          ) {
            await db.$transaction(async (tx) => {
              await tx.$queryRaw`SELECT id FROM LiveDevice WHERE id = ${d.id} FOR UPDATE`;
              const current = await tx.liveDevice.findUniqueOrThrow({ where: { id: d.id } });
              if (current.lastSeenAt?.getTime() !== d.lastSeenAt?.getTime()) return;
              const threshold = new Date(+d.lastSeenAt! + d.intervalSeconds * 4000);
              const gap = await tx.liveDeviceOutage.findFirst({
                where: { deviceId: d.id, kind: 'unknown', endedAt: { gte: threshold } },
                orderBy: { endedAt: 'desc' },
              });
              const startedAt = gap?.endedAt ?? threshold;
              await tx.liveDeviceOutage.upsert({
                where: { deviceId_startedAt: { deviceId: d.id, startedAt } },
                create: { deviceId: d.id, startedAt },
                update: {},
              });
            });
          }
        await notifyLiveStatus(m.eventId);
      }
      if (Date.now() > nextCleanup) {
        nextCleanup = Date.now() + 3600_000;
        const cutoff = new Date(Date.now() - 30 * 86400_000);
        const samples = await db.liveDeviceSample.findMany({
          where: { minute: { lt: cutoff } },
          take: 1000,
          select: { deviceId: true, minute: true },
        });
        if (samples.length) await db.liveDeviceSample.deleteMany({ where: { OR: samples } });
        const receipts = await db.liveHeartbeatReceipt.findMany({
          where: { receivedAt: { lt: cutoff } },
          take: 1000,
          select: { deviceId: true, messageId: true },
        });
        if (receipts.length) await db.liveHeartbeatReceipt.deleteMany({ where: { OR: receipts } });
        const outages = await db.liveDeviceOutage.findMany({
          where: { endedAt: { lt: cutoff } },
          take: 1000,
          select: { id: true },
        });
        if (outages.length)
          await db.liveDeviceOutage.deleteMany({ where: { id: { in: outages.map((o) => o.id) } } });
        if (samples.length === 1000 || receipts.length === 1000 || outages.length === 1000)
          nextCleanup = 0;
        await db.liveDevice.updateMany({
          where: { measuredAt: { lt: cutoff } },
          data: { metrics: {}, version: { increment: 1 } },
        });
      }
    } catch (error) {
      report(error);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  return async () => {
    closed = true;
    clearInterval(timer);
    while (busy) await new Promise((resolve) => setTimeout(resolve, 20));
  };
}
