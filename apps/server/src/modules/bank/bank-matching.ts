import { randomUUID } from 'node:crypto';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ConflictError, NotFoundError, ValidationError } from '../../exceptions/index.js';
import {
  Prisma,
  type BankConnection,
  type BankTransaction,
} from '../../generated/prisma/client.js';
import type {
  BankConnectionMode,
  BankMatchingStatus,
  BankTransactionSource,
} from '../../generated/prisma/enums.js';
import {
  entryPaymentTransaction,
  reconcileEntryPaymentState,
} from '../entry/entry-payment-write.js';
import { enqueueBankPaymentNotification } from './bank-notifications.js';
import { bankTransactionItemSchema, type BankBatchResult } from './bank.schema.js';

/** Largest amount an EntryPayment receipt (Decimal(10,2)) can hold. */
const RECEIPT_MAX = new Prisma.Decimal('99999999.99');
const RESOLVABLE: BankMatchingStatus[] = ['UNMATCHED', 'AMBIGUOUS'];

export const toDay = (day: string) => new Date(`${day}T00:00:00.000Z`);
export const fromDay = (date: Date) => date.toISOString().slice(0, 10);

/** TEST connections and simulated items may only touch demo events. */
const demoOnly = (mode: BankConnectionMode, source: BankTransactionSource) =>
  mode === 'TEST' || source === 'SIMULATED';

/** Open orders of the owner's events; never another owner's, never closed ones. */
function orderScope(ownerId: number, demo: boolean): Prisma.EntryWhereInput {
  return {
    status: { notIn: ['CANCELLED', 'REJECTED'] },
    event: { authorId: ownerId, ...(demo ? { demo: true } : {}) },
  };
}

export function serializeBankTransaction(row: BankTransaction) {
  return {
    id: row.id,
    connectionId: row.connectionId,
    providerTransactionId: row.providerTransactionId,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    variableSymbol: row.variableSymbol,
    bookingDate: fromDay(row.bookingDate),
    source: row.source,
    trust: row.trust,
    matchingStatus: row.matchingStatus,
    matchedEntryId: row.matchedEntryId,
    matchedAmount: row.matchedAmount?.toFixed(2) ?? null,
    reportedByDeviceId: row.reportedByDeviceId,
    receivedAt: row.receivedAt.toISOString(),
  };
}

function batchResult(row: BankTransaction, status: BankBatchResult['status']): BankBatchResult {
  return {
    providerTransactionId: row.providerTransactionId,
    status,
    ...(row.matchedEntryId
      ? { entryId: row.matchedEntryId, label: `Order #${row.variableSymbol}` }
      : {}),
    ...(row.matchedAmount ? { matchedAmount: row.matchedAmount.toFixed(2) } : {}),
  };
}

/**
 * Settle a stored transaction against one order. Call only under the entry lock
 * (`entryPaymentTransaction`), or inside the transaction that created the order.
 * Returns the row unchanged when the order no longer qualifies.
 */
async function settle(
  tx: Prisma.TransactionClient,
  row: BankTransaction,
  entryId: string,
  ownerId: number,
  scope: Prisma.EntryWhereInput,
): Promise<BankTransaction> {
  const entry = await tx.entry.findFirst({
    where: { id: entryId, ...scope },
    select: { id: true, eventId: true, totalAmount: true, currency: true },
  });
  if (!entry || entry.currency !== row.currency || row.amount.greaterThan(RECEIPT_MAX)) {
    return row;
  }
  const received = await tx.entryPayment.aggregate({
    where: { eventId: entry.eventId, entryId: entry.id },
    _sum: { amount: true },
  });
  // Compare with what is still owed, so a second transfer can complete a partial payment.
  const outstanding = entry.totalAmount.minus(received._sum.amount ?? 0);
  const status: BankMatchingStatus = row.amount.equals(outstanding)
    ? 'MATCHED'
    : row.amount.lessThan(outstanding)
      ? 'PARTIALLY_PAID'
      : 'OVERPAID';
  const updated = await tx.bankTransaction.update({
    where: { id: row.id },
    data: { matchingStatus: status, matchedEntryId: entry.id, matchedAmount: row.amount },
  });
  await tx.entryPayment.create({
    data: {
      eventId: entry.eventId,
      entryId: entry.id,
      clientPaymentId: randomUUID(),
      method: 'QR',
      amount: row.amount,
      currency: row.currency,
      paidAt: row.bookingDate,
      deviceId: row.reportedByDeviceId,
      operatorId: ownerId,
      source: 'BANK_IMPORT',
      bankTransactionId: row.id,
    },
  });
  await reconcileEntryPaymentState(tx, entry.eventId, entry.id, ownerId);
  return updated;
}

const isUniqueViolation = (cause: unknown) =>
  cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002';

/** Store and match one reported item. Never throws for item-level problems. */
export async function ingestBankTransaction(
  prisma: AppPrismaClient,
  connection: BankConnection,
  raw: unknown,
  deviceId: string,
): Promise<BankBatchResult> {
  const reportedId =
    raw && typeof raw === 'object' && 'providerTransactionId' in raw
      ? String(raw.providerTransactionId).slice(0, 32)
      : null;
  const parsed = bankTransactionItemSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      providerTransactionId: reportedId,
      status: 'INVALID',
      issues: parsed.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
    };
  }
  const item = parsed.data;
  if (item.source === 'SIMULATED' && connection.mode === 'LIVE') {
    return {
      providerTransactionId: item.providerTransactionId,
      status: 'INVALID',
      issues: [{ path: 'source', message: 'SIMULATED transactions require a TEST connection' }],
    };
  }

  const key = {
    connectionId_providerTransactionId: {
      connectionId: connection.id,
      providerTransactionId: item.providerTransactionId,
    },
  };
  const existing = await prisma.bankTransaction.findUnique({ where: key });
  if (existing) return batchResult(existing, 'DUPLICATE');

  const data = {
    connectionId: connection.id,
    providerTransactionId: item.providerTransactionId,
    amount: new Prisma.Decimal(item.amount),
    currency: item.currency,
    variableSymbol: item.variableSymbol,
    bookingDate: toDay(item.bookingDate),
    source: item.source,
    reportedByDeviceId: deviceId,
  };
  try {
    if (
      !item.variableSymbol.startsWith(connection.variableSymbolPrefix) ||
      data.bookingDate < connection.prefixEffectiveFrom
    ) {
      const row = await prisma.bankTransaction.create({
        data: { ...data, matchingStatus: 'IGNORED' },
      });
      return batchResult(row, row.matchingStatus);
    }
    const scope = orderScope(connection.ownerId, demoOnly(connection.mode, item.source));
    const candidates = await prisma.entry.findMany({
      where: { ...scope, paymentReference: item.variableSymbol },
      select: { id: true, eventId: true },
      take: 2,
    });
    const [candidate] = candidates;
    if (candidates.length !== 1 || !candidate) {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.bankTransaction.create({
          data: { ...data, matchingStatus: candidates.length ? 'AMBIGUOUS' : 'UNMATCHED' },
        });
        await enqueueBankPaymentNotification(tx, created, connection.ownerId);
        return created;
      });
      return batchResult(row, row.matchingStatus);
    }
    const row = await entryPaymentTransaction(
      prisma,
      candidate.eventId,
      candidate.id,
      async (tx) => {
        const settled = await settle(
          tx,
          await tx.bankTransaction.create({ data: { ...data, matchingStatus: 'UNMATCHED' } }),
          candidate.id,
          connection.ownerId,
          scope,
        );
        await enqueueBankPaymentNotification(tx, settled, connection.ownerId);
        return settled;
      },
    );
    return batchResult(row, row.matchingStatus);
  } catch (cause) {
    // A concurrent report of the same item won the unique constraint.
    if (isUniqueViolation(cause)) {
      const winner = await prisma.bankTransaction.findUnique({ where: key });
      if (winner) return batchResult(winner, 'DUPLICATE');
    }
    throw cause;
  }
}

async function findOwnedTransaction(prisma: AppPrismaClient, ownerId: number, id: string) {
  const row = await prisma.bankTransaction.findFirst({
    where: { id, connection: { ownerId } },
    include: { connection: { select: { mode: true } } },
  });
  if (!row) throw new NotFoundError('Bank transaction not found.');
  return row;
}

/** Organizer resolves an UNMATCHED or AMBIGUOUS transaction to one of their open orders. */
export async function matchBankTransactionManually(
  prisma: AppPrismaClient,
  ownerId: number,
  id: string,
  entryId: string,
) {
  const row = await findOwnedTransaction(prisma, ownerId, id);
  if (!RESOLVABLE.includes(row.matchingStatus)) {
    throw new ConflictError('Only UNMATCHED or AMBIGUOUS transactions can be matched.');
  }
  const scope = orderScope(ownerId, demoOnly(row.connection.mode, row.source));
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, ...scope },
    select: { id: true, eventId: true, currency: true },
  });
  if (!entry) throw new NotFoundError('Open entry order not found.');
  if (entry.currency !== row.currency) {
    throw new ValidationError('Transaction currency must match the entry currency.');
  }
  try {
    const updated = await entryPaymentTransaction(prisma, entry.eventId, entry.id, async (tx) => {
      const current = await tx.bankTransaction.findFirst({
        where: { id, matchingStatus: { in: RESOLVABLE } },
      });
      if (!current) throw new ConflictError('The transaction was resolved concurrently.');
      const settled = await settle(tx, current, entry.id, ownerId, scope);
      if (!settled.matchedEntryId) {
        throw new ConflictError('The transaction cannot be matched to this entry order.');
      }
      return settled;
    });
    return serializeBankTransaction(updated);
  } catch (cause) {
    // The unique bankTransactionId on receipts admits one concurrent manual match.
    if (isUniqueViolation(cause))
      throw new ConflictError('The transaction was resolved concurrently.');
    throw cause;
  }
}

export async function ignoreBankTransaction(prisma: AppPrismaClient, ownerId: number, id: string) {
  await findOwnedTransaction(prisma, ownerId, id);
  const { count } = await prisma.bankTransaction.updateMany({
    where: { id, matchingStatus: { in: RESOLVABLE } },
    data: { matchingStatus: 'IGNORED' },
  });
  if (!count) throw new ConflictError('Only UNMATCHED or AMBIGUOUS transactions can be ignored.');
  return serializeBankTransaction(
    await prisma.bankTransaction.findUniqueOrThrow({ where: { id } }),
  );
}

/**
 * Re-run matching of UNMATCHED transactions carrying this order's payment
 * reference. Call inside the transaction that creates or reprices the order.
 */
export async function rematchEntryBankTransactions(tx: Prisma.TransactionClient, entryId: string) {
  const entry = await tx.entry.findUnique({
    where: { id: entryId },
    select: { paymentReference: true, event: { select: { authorId: true, demo: true } } },
  });
  const ownerId = entry?.event.authorId;
  if (!entry || !ownerId) return;
  const rows = await tx.bankTransaction.findMany({
    where: {
      variableSymbol: entry.paymentReference,
      matchingStatus: 'UNMATCHED',
      connection: { ownerId, ...(entry.event.demo ? {} : { mode: 'LIVE' }) },
      ...(entry.event.demo ? {} : { source: 'BANK_API' }),
    },
    include: { connection: { select: { mode: true } } },
    orderBy: [{ bookingDate: 'asc' }, { id: 'asc' }],
  });
  for (const { connection, ...row } of rows) {
    const scope = orderScope(ownerId, demoOnly(connection.mode, row.source));
    // Another open order with the same reference makes it ambiguous: leave it for manual resolve.
    const candidates = await tx.entry.count({
      where: { ...scope, paymentReference: row.variableSymbol },
      take: 2,
    });
    if (candidates !== 1) continue;
    const settled = await settle(tx, row, entryId, ownerId, scope);
    if (settled !== row) await enqueueBankPaymentNotification(tx, settled, ownerId);
  }
}
