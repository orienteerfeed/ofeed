import type { AppPrismaClient } from '../../db/prisma-client.js';
import { Prisma } from '../../generated/prisma/client.js';

export type PunchTx = Prisma.TransactionClient;
export type PunchChanges = Map<number, number>;

export function isPunchWriteConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/deadlock|write conflict|P2034|1213/i.test(error.message) ||
      ('code' in error && error.code === 'P2034'))
  );
}

export async function lockPunchEvent(tx: PunchTx, eventId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM Event WHERE id = ${eventId} FOR UPDATE`;
}

/** All timing/assignment/snapshot writers must acquire this lock before reading. */
export async function eventPunchTransaction<T>(
  client: AppPrismaClient,
  eventId: string,
  operation: (tx: PunchTx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(
        async (tx) => {
          await lockPunchEvent(tx, eventId);
          return operation(tx);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (!isPunchWriteConflict(error) || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

/** Snapshot callers also consume pending observations on the old/new timing cards.
 * Must run under the event lock, before reconciliation can assign those punches.
 */
export async function supersedeCompetitorPunches(
  tx: PunchTx,
  competitorIds: number[],
  pending?: { eventId: string; cards: Array<number | null | undefined> },
) {
  const cards = [...new Set(pending?.cards.filter((card): card is number => card != null) ?? [])];
  await tx.punch.updateMany({
    where: {
      superseded: false,
      ...(pending
        ? {
            eventId: pending.eventId,
            OR: [
              { competitorId: { in: competitorIds } },
              { competitorId: null, card: { in: cards } },
            ],
          }
        : { competitorId: { in: competitorIds } }),
    },
    data: { superseded: true, splitId: null },
  });
}

export async function publishPunchChanges(eventId: string, changes: PunchChanges) {
  if (changes.size === 0) return;
  // Loaded after commit; avoids service-registration dependency cycles.
  const { publishUpdatedCompetitorsById, publishUpdatedClasses } = await import(
    '../competitor/competitor-change.service.js'
  );
  const report = (id: number, error: unknown) =>
    console.error('Punch subscription publication failed', { eventId, id, error });
  await publishUpdatedCompetitorsById(eventId, changes.keys(), report);
  await publishUpdatedClasses(changes.values(), report);
}
