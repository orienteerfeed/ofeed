import type { Prisma } from '../../generated/prisma/client.js';
import type { BankMatchingStatus } from '../../generated/prisma/enums.js';

/** Statuses that may produce a push; each can be switched off per user. */
export const NOTIFIABLE_STATUSES = ['MATCHED', 'OVERPAID', 'UNMATCHED'] as const;
export type NotifiableStatus = (typeof NOTIFIABLE_STATUSES)[number];
export type BankPushSettings = Record<NotifiableStatus, boolean>;

const isNotifiable = (status: BankMatchingStatus): status is NotifiableStatus =>
  (NOTIFIABLE_STATUSES as readonly string[]).includes(status);

/** Stored value is a partial map; anything missing or malformed means "on". */
export function readBankPushSettings(
  stored: Prisma.JsonValue | null | undefined,
): BankPushSettings {
  const map = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  return Object.fromEntries(
    NOTIFIABLE_STATUSES.map((status) => [status, map[status] !== false]),
  ) as BankPushSettings;
}

/**
 * Queue one push for this transaction status. Call in the transaction that
 * stores the status: a rolled-back match never pushes, and the unique
 * (transaction, status) key keeps retries from pushing twice.
 */
export async function enqueueBankPaymentNotification(
  tx: Prisma.TransactionClient,
  row: { id: string; matchingStatus: BankMatchingStatus },
  ownerId: number,
) {
  if (!isNotifiable(row.matchingStatus)) return;
  const user = await tx.user.findUnique({
    where: { id: ownerId },
    select: { bankPushStatuses: true },
  });
  if (!user || !readBankPushSettings(user.bankPushStatuses)[row.matchingStatus]) return;
  await tx.bankPaymentNotification.createMany({
    data: [{ userId: ownerId, bankTransactionId: row.id, matchingStatus: row.matchingStatus }],
    skipDuplicates: true,
  });
}
