import type { AppPrismaClient } from '../../db/prisma-client.js';

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
