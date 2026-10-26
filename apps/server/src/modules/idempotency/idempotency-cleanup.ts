import type { AppPrismaClient } from '../../db/prisma-client.js';

/** Purge expired private response bodies even for events receiving no more traffic. */
export function startIdempotencyCleanup(
  prisma: AppPrismaClient,
  reportError: (error: unknown) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void>;
  const clean = async () => {
    try {
      // Bound each pass so expiry cleanup cannot monopolize a busy database.
      const now = new Date();
      const expired = await prisma.idempotencyResponse.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: 1000,
      });
      if (expired.length) {
        await prisma.idempotencyResponse.deleteMany({
          where: { id: { in: expired.map(({ id }) => id) }, expiresAt: { lte: now } },
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
