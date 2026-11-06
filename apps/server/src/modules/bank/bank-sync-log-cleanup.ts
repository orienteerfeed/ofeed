import type { AppPrismaClient } from '../../db/prisma-client.js';

export const BANK_SYNC_LOG_RETENTION_DAYS = 90;

/** Delete collector run logs older than the retention period, 1000 rows per pass. */
export function startBankSyncLogCleanup(
  prisma: AppPrismaClient,
  reportError: (error: unknown) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void>;
  const clean = async () => {
    try {
      const cutoff = new Date(Date.now() - BANK_SYNC_LOG_RETENTION_DAYS * 86_400_000);
      const expired = await prisma.bankSyncLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 1000,
      });
      if (expired.length) {
        await prisma.bankSyncLog.deleteMany({
          where: { id: { in: expired.map(({ id }) => id) } },
        });
      }
    } catch (error) {
      reportError(error);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          running = clean();
        }, 60_000);
        timer.unref();
      }
    }
  };
  running = clean();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
