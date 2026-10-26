import type { AppPrismaClient } from '../../db/prisma-client.js';
export function startSessionCleanup(prisma: AppPrismaClient, report: (error: unknown) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void>;
  const clean = async () => {
    try {
      const now = new Date();
      const rows = await prisma.deviceSession.findMany({
        where: { absoluteExpiresAt: { lte: now } },
        select: { id: true },
        orderBy: { absoluteExpiresAt: 'asc' },
        take: 1000,
      });
      if (rows.length)
        await prisma.deviceSession.deleteMany({
          where: { id: { in: rows.map((row) => row.id) }, absoluteExpiresAt: { lte: now } },
        });
    } catch (error) {
      report(error);
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
