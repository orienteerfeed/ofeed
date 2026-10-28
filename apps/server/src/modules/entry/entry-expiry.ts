import type { AppPrismaClient } from '../../db/prisma-client.js';
import { eventPunchTransaction } from '../punch/punch-write.js';
import { updateEntryOrderStatusInTransaction } from './entry.service.js';

export async function expireEntryOrders(prisma: AppPrismaClient, now = new Date()) {
  const where = {
    status: 'RECEIVED' as const,
    paid: false,
    paymentMethod: { not: 'CASH' as const },
    paymentDueAt: { lte: now },
  };
  const entries = await prisma.entry.findMany({
    where,
    select: { id: true, eventId: true },
    orderBy: { paymentDueAt: 'asc' },
    take: 100,
  });
  for (const entry of entries) {
    await eventPunchTransaction(prisma, entry.eventId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM Entry WHERE id = ${entry.id} AND eventId = ${entry.eventId} FOR UPDATE`;
      if (!(await tx.entry.findFirst({ where: { ...where, id: entry.id }, select: { id: true } })))
        return;
      await updateEntryOrderStatusInTransaction(tx, {
        eventId: entry.eventId,
        entryId: entry.id,
        status: 'CANCELLED',
        changedById: null,
      });
    });
  }
  return entries.length;
}

export function startEntryExpiry(prisma: AppPrismaClient, report: (error: unknown) => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      while (!stopped && (await expireEntryOrders(prisma)) === 100) {
        /* Drain pending batches. */
      }
    } catch (error) {
      report(error);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          running = run();
        }, 60_000);
        timer.unref();
      }
    }
  };
  let running = run();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
