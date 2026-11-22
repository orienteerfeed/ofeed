import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export async function ensureMonitoring(
  db: Pick<Prisma.TransactionClient, 'liveMonitoring'>,
  eventId: string,
  startedAt: Date,
  until: Date,
) {
  const previous = await db.liveMonitoring.findUnique({ where: { eventId } });
  if (previous && previous.until > startedAt) {
    if (previous.until < until)
      await db.liveMonitoring.update({ where: { eventId }, data: { until } });
    return;
  }
  await restartMonitoring(db, eventId, startedAt, until);
}

/** Every new monitoring window starts its own liveness checkpoint. */
export function restartMonitoring(
  db: Pick<AppPrismaClient, 'liveMonitoring'>,
  eventId: string,
  startedAt: Date,
  until: Date,
) {
  const window = { startedAt, checkedAt: startedAt, until };
  return db.liveMonitoring.upsert({
    where: { eventId },
    create: { eventId, ...window },
    update: window,
  });
}
