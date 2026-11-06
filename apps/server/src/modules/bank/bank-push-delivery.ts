import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { BankMatchingStatus } from '../../generated/prisma/enums.js';
import {
  EXPO_PUSH_BATCH_MAX,
  ExpoPushError,
  type ExpoPushMessage,
  type ExpoPushSender,
} from './expo-push.js';

export const BANK_PUSH_MAX_ATTEMPTS = 5;
const CLAIM_MS = 60_000;
const BATCH = 50;
const INTERVAL_MS = 5_000;
const RETENTION_MS = 30 * 86_400_000;

// ponytail: English titles; the app can localize from data.status. Add server-side locales if needed.
const TITLES: Partial<Record<BankMatchingStatus, string>> = {
  MATCHED: 'Payment matched',
  OVERPAID: 'Overpayment received',
  UNMATCHED: 'Unmatched payment',
};

/** Rows another replica may take: unsent, attempts left, claim expired. */
const claimable = (now: Date) => ({
  sentAt: null,
  attempts: { lt: BANK_PUSH_MAX_ATTEMPTS },
  OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
});

async function deliverOne(prisma: AppPrismaClient, send: ExpoPushSender, id: string, now: Date) {
  // Conditional claim: exactly one replica wins each attempt.
  const claimed = await prisma.bankPaymentNotification.updateMany({
    where: { id, ...claimable(now) },
    data: { claimedUntil: new Date(now.getTime() + CLAIM_MS), attempts: { increment: 1 } },
  });
  if (!claimed.count) return;
  const notification = await prisma.bankPaymentNotification.findUnique({
    where: { id },
    include: {
      bankTransaction: true,
      user: {
        select: { pushDevices: { select: { expoPushToken: true } } },
      },
    },
  });
  if (!notification) return;
  const markSent = (lastErrorCode: string | null) =>
    prisma.bankPaymentNotification.update({
      where: { id },
      data: { sentAt: now, claimedUntil: null, lastErrorCode },
    });

  const tokens = notification.user.pushDevices.map(({ expoPushToken }) => expoPushToken);
  if (!tokens.length) {
    await markSent('NO_DEVICES');
    return;
  }
  const { bankTransaction: transaction, matchingStatus } = notification;
  const amount = transaction.amount.toFixed(2);
  // No token and no payer data: only what the app needs to deep-link the order.
  const data: Record<string, string> = {
    type: 'BANK_PAYMENT',
    transactionId: transaction.id,
    amount,
    currency: transaction.currency,
    status: matchingStatus,
    ...(transaction.matchedEntryId ? { entryId: transaction.matchedEntryId } : {}),
  };
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: TITLES[matchingStatus] ?? 'Bank payment',
    body: `${amount} ${transaction.currency} · VS ${transaction.variableSymbol}`,
    data,
    sound: 'default',
    priority: 'high',
  }));

  try {
    let failed = 0;
    for (let offset = 0; offset < messages.length; offset += EXPO_PUSH_BATCH_MAX) {
      const batch = messages.slice(offset, offset + EXPO_PUSH_BATCH_MAX);
      const tickets = await send(batch);
      const unregistered = batch
        .filter((_, index) => {
          const ticket = tickets[index];
          return ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
        })
        .map(({ to }) => to);
      if (unregistered.length) {
        await prisma.pushDevice.deleteMany({ where: { expoPushToken: { in: unregistered } } });
      }
      // Per-ticket errors are recorded, not retried; push receipts are not polled.
      failed += tickets.filter((ticket) => ticket.status === 'error').length;
    }
    await markSent(failed ? `TICKET_ERRORS_${failed}` : null);
  } catch (error) {
    const retryable = !(error instanceof ExpoPushError) || error.retryable;
    await prisma.bankPaymentNotification.update({
      where: { id },
      data: {
        lastErrorCode: error instanceof ExpoPushError ? error.code : 'UNKNOWN',
        claimedUntil: new Date(now.getTime() + 30_000 * 2 ** (notification.attempts - 1)),
        ...(retryable ? {} : { attempts: BANK_PUSH_MAX_ATTEMPTS }),
      },
    });
  }
}

/** One pass: deliver up to 50 pending pushes, then drop outbox rows older than 30 days. */
export async function deliverPendingBankPushes(
  prisma: AppPrismaClient,
  send: ExpoPushSender,
  now = new Date(),
) {
  const pending = await prisma.bankPaymentNotification.findMany({
    where: claimable(now),
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });
  for (const { id } of pending) await deliverOne(prisma, send, id, now);

  const expired = await prisma.bankPaymentNotification.findMany({
    where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } },
    select: { id: true },
    take: 1000,
  });
  if (expired.length) {
    await prisma.bankPaymentNotification.deleteMany({
      where: { id: { in: expired.map(({ id }) => id) } },
    });
  }
}

export function startBankPushDelivery(
  prisma: AppPrismaClient,
  send: ExpoPushSender,
  reportError: (error: unknown) => void,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void>;
  const run = async () => {
    try {
      await deliverPendingBankPushes(prisma, send);
    } catch (error) {
      reportError(error);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          running = run();
        }, INTERVAL_MS);
        timer.unref();
      }
    }
  };
  running = run();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
