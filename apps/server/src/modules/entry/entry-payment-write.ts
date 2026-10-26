import type { AppPrismaClient } from '../../db/prisma-client.js';
import { NotFoundError } from '../../exceptions/index.js';
import { Prisma } from '../../generated/prisma/client.js';

/** Receipt, paid-flag and price writers acquire the same lock before reading. */
export async function entryPaymentTransaction<T>(
  prisma: AppPrismaClient,
  eventId: string,
  entryId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM Entry WHERE id = ${entryId} AND eventId = ${eventId} FOR UPDATE
        `;
          if (!rows.length) throw new NotFoundError('Entry order not found for this event.');
          return operation(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (cause) {
      if (
        !(cause instanceof Prisma.PrismaClientKnownRequestError) ||
        !(
          cause.code === 'P2034' ||
          (cause.code === 'P2010' && /deadlock|lock wait timeout/i.test(cause.message))
        ) ||
        attempt >= 2
      )
        throw cause;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
}

/** Call only after acquiring the entry lock. Empty ledgers preserve manual status. */
export async function reconcileEntryPaymentState(
  tx: Prisma.TransactionClient,
  eventId: string,
  entryId: string,
  operatorId: number | null,
) {
  const totals = await tx.entryPayment.aggregate({
    where: { eventId, entryId },
    _sum: { amount: true },
  });
  if (totals._sum.amount === null) return;
  const entry = await tx.entry.findUniqueOrThrow({ where: { id: entryId } });
  const paid = totals._sum.amount.greaterThanOrEqualTo(entry.totalAmount);
  if (entry.paid === paid) return;
  await tx.entry.update({
    where: { id: entryId },
    data: {
      paid,
      statusHistory: { create: { status: null, paymentState: paid, changedById: operatorId } },
    },
  });
}
