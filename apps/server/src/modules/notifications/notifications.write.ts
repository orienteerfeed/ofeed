import type { Prisma } from '../../generated/prisma/client.js';

type NotificationSource =
  | { kind: 'ENTRY_ORDER_RECEIVED'; entryId: string; itemCount: number }
  | {
      kind: 'ENTRY_PAYMENT_RECEIVED';
      entryId: string;
      paymentId: string;
      amount: Prisma.Decimal;
      currency: string;
      method: string;
    };

/** Must be called inside the transaction that creates the source record. */
export async function enqueueUserNotification(
  tx: Prisma.TransactionClient,
  eventId: string,
  source: NotificationSource,
) {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: { name: true, authorId: true, author: { select: { deletedAt: true } } },
  });
  if (!event?.authorId || !event.author || event.author.deletedAt) return;
  // Account anonymization takes the same row lock before erasing its inbox.
  // A receipt racing erasure must not recreate messages for the deleted user.
  const recipients = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`
    SELECT deletedAt FROM User WHERE id = ${event.authorId} FOR UPDATE
  `;
  if (!recipients.length || recipients[0].deletedAt) return;
  const payment = source.kind === 'ENTRY_PAYMENT_RECEIVED';
  await tx.userNotification.createMany({
    data: [
      {
        userId: event.authorId,
        eventId,
        entryId: source.entryId,
        kind: source.kind,
        sourceKey: payment ? `payment:${source.paymentId}` : `order:${source.entryId}`,
        eventName: event.name,
        ...(payment
          ? { amount: source.amount, currency: source.currency, method: source.method }
          : { itemCount: source.itemCount }),
      },
    ],
    skipDuplicates: true,
  });
}
