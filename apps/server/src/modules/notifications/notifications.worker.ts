import type { AppPrismaClient } from '../../db/prisma-client.js';
import { pubsub } from '../../lib/pubsub.js';
import { notificationTopic, RETENTION_DAYS } from './notifications.service.js';

export async function publishPendingNotifications(db: AppPrismaClient) {
  const rows = await db.userNotification.findMany({
    where: { publishedAt: null },
    select: { id: true, userId: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  for (const userId of new Set(rows.map((row) => row.userId))) {
    await pubsub.publish(notificationTopic(userId), true);
    await db.userNotification.updateMany({
      where: {
        id: { in: rows.filter((row) => row.userId === userId).map((row) => row.id) },
        publishedAt: null,
      },
      data: { publishedAt: new Date() },
    });
  }
}

export async function cleanupNotifications(db: AppPrismaClient, now = new Date()) {
  const rows = await db.userNotification.findMany({
    where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });
  if (rows.length)
    await db.userNotification.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
}

export function startNotificationWorker(
  db: AppPrismaClient,
  reportError: (error: unknown) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastCleanup = 0;
  let running: Promise<void>;
  const tick = async () => {
    try {
      if (Date.now() - lastCleanup >= 60_000) {
        await cleanupNotifications(db);
        lastCleanup = Date.now();
      }
      await publishPendingNotifications(db);
    } catch (error) {
      reportError(error);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          running = tick();
        }, 2000);
        timer.unref();
      }
    }
  };
  running = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
