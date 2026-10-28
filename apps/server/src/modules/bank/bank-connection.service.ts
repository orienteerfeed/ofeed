import type { z } from '@hono/zod-openapi';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ConflictError, NotFoundError, ValidationError } from '../../exceptions/index.js';
import { Prisma, type BankConnection } from '../../generated/prisma/client.js';
import { requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import {
  fromDay,
  ingestBankTransaction,
  serializeBankTransaction,
  toDay,
} from './bank-matching.js';
import type {
  bankSyncReportSchema,
  bankTransactionQuerySchema,
  createBankConnectionSchema,
  eventBankTransactionQuerySchema,
  updateBankConnectionSchema,
} from './bank.schema.js';

const iso = (value: Date | null) => value?.toISOString() ?? null;

export function serializeBankConnection(row: BankConnection) {
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    name: row.name,
    accountIdentifier: row.accountIdentifier,
    variableSymbolPrefix: row.variableSymbolPrefix,
    prefixEffectiveFrom: fromDay(row.prefixEffectiveFrom),
    status: row.status,
    collectorDeviceId: row.collectorDeviceId,
    lastSeenAt: iso(row.lastSeenAt),
    lastSuccessfulSyncAt: iso(row.lastSuccessfulSyncAt),
    lastRelevantAt: iso(row.lastRelevantAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revokedAt: iso(row.revokedAt),
  };
}

/** Owner scoping: another owner's connection is indistinguishable from a missing one. */
async function findOwnedConnection(prisma: AppPrismaClient, ownerId: number, id: string) {
  const connection = await prisma.bankConnection.findFirst({ where: { id, ownerId } });
  if (!connection) throw new NotFoundError('Bank connection not found.');
  return connection;
}

async function findActiveConnection(prisma: AppPrismaClient, ownerId: number, id: string) {
  const connection = await findOwnedConnection(prisma, ownerId, id);
  if (connection.status !== 'ACTIVE') {
    throw new ConflictError(`Bank connection is ${connection.status.toLowerCase()}.`);
  }
  return connection;
}

/** Prefix changes are never retroactive: the effective day cannot be in the past (UTC). */
function assertNotRetroactive(day: string, now: Date) {
  if (day < fromDay(now)) throw new ValidationError('prefixEffectiveFrom cannot be in the past.');
}

export async function createBankConnection(
  prisma: AppPrismaClient,
  ownerId: number,
  input: z.infer<typeof createBankConnectionSchema>,
) {
  const key = {
    ownerId_provider_accountIdentifier: {
      ownerId,
      provider: input.provider,
      accountIdentifier: input.accountIdentifier,
    },
  };
  const existing = await prisma.bankConnection.findUnique({ where: key });
  if (existing) return { connection: serializeBankConnection(existing), created: false };
  try {
    const connection = await prisma.bankConnection.create({
      data: {
        ownerId,
        provider: input.provider,
        mode: input.mode,
        name: input.name,
        accountIdentifier: input.accountIdentifier,
        variableSymbolPrefix: input.variableSymbolPrefix,
        prefixEffectiveFrom: toDay(input.prefixEffectiveFrom),
        collectorDeviceId: input.deviceId,
      },
    });
    return { connection: serializeBankConnection(connection), created: true };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      const winner = await prisma.bankConnection.findUnique({ where: key });
      if (winner) return { connection: serializeBankConnection(winner), created: false };
    }
    throw cause;
  }
}

export async function listBankConnections(prisma: AppPrismaClient, ownerId: number) {
  const rows = await prisma.bankConnection.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map(serializeBankConnection);
}

export async function updateBankConnection(
  prisma: AppPrismaClient,
  ownerId: number,
  id: string,
  input: z.infer<typeof updateBankConnectionSchema>,
  now = new Date(),
) {
  const connection = await findOwnedConnection(prisma, ownerId, id);
  const prefixChanged =
    input.variableSymbolPrefix !== undefined &&
    input.variableSymbolPrefix !== connection.variableSymbolPrefix;
  if (prefixChanged && input.prefixEffectiveFrom === undefined) {
    throw new ValidationError('Changing variableSymbolPrefix requires prefixEffectiveFrom.');
  }
  if (input.prefixEffectiveFrom !== undefined) assertNotRetroactive(input.prefixEffectiveFrom, now);
  const statusData =
    input.status === undefined || input.status === connection.status
      ? {}
      : { status: input.status, revokedAt: input.status === 'REVOKED' ? now : null };
  const updated = await prisma.bankConnection.update({
    where: { id: connection.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.variableSymbolPrefix !== undefined
        ? { variableSymbolPrefix: input.variableSymbolPrefix }
        : {}),
      ...(input.prefixEffectiveFrom !== undefined
        ? { prefixEffectiveFrom: toDay(input.prefixEffectiveFrom) }
        : {}),
      ...statusData,
    },
  });
  return serializeBankConnection(updated);
}

export async function revokeBankConnection(
  prisma: AppPrismaClient,
  ownerId: number,
  id: string,
  now = new Date(),
) {
  const connection = await findOwnedConnection(prisma, ownerId, id);
  if (connection.status === 'REVOKED') return serializeBankConnection(connection);
  const updated = await prisma.bankConnection.update({
    where: { id: connection.id },
    data: { status: 'REVOKED', revokedAt: now },
  });
  return serializeBankConnection(updated);
}

/** Items are processed sequentially so results keep request order and lock waits stay short. */
export async function reportBankTransactions(
  prisma: AppPrismaClient,
  ownerId: number,
  id: string,
  deviceId: string,
  items: unknown[],
) {
  const connection = await findActiveConnection(prisma, ownerId, id);
  const results = [];
  for (const item of items) {
    results.push(await ingestBankTransaction(prisma, connection, item, deviceId));
  }
  return results;
}

export async function recordBankSyncReport(
  prisma: AppPrismaClient,
  ownerId: number,
  id: string,
  input: z.infer<typeof bankSyncReportSchema>,
  now = new Date(),
) {
  const connection = await findActiveConnection(prisma, ownerId, id);
  const finishedAt = new Date(input.finishedAt);
  await prisma.$transaction([
    prisma.bankSyncLog.create({
      data: {
        connectionId: connection.id,
        deviceId: input.deviceId,
        startedAt: new Date(input.startedAt),
        finishedAt,
        status: input.status,
        fetchedCount: input.fetchedCount,
        relevantCount: input.relevantCount,
        matchedCount: input.matchedCount,
        errorCode: input.errorCode,
      },
    }),
    prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        collectorDeviceId: input.deviceId,
        lastSeenAt: now,
        ...(input.status === 'OK' ? { lastSuccessfulSyncAt: finishedAt } : {}),
        ...(input.relevantCount > 0 ? { lastRelevantAt: finishedAt } : {}),
      },
    }),
  ]);
  return serializeBankConnection(
    await prisma.bankConnection.findUniqueOrThrow({ where: { id: connection.id } }),
  );
}

export async function listConnectionBankTransactions(
  prisma: AppPrismaClient,
  ownerId: number,
  id: string,
  query: z.infer<typeof bankTransactionQuerySchema>,
) {
  const connection = await findOwnedConnection(prisma, ownerId, id);
  const rows = await prisma.bankTransaction.findMany({
    where: {
      connectionId: connection.id,
      ...(query.status ? { matchingStatus: query.status } : {}),
      ...(query.since ? { receivedAt: { gte: new Date(query.since) } } : {}),
    },
    orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const last = rows.at(-1);
  return {
    data: rows.map(serializeBankTransaction),
    nextCursor: rows.length === query.limit && last ? last.id : null,
  };
}

/** Event owner (or admin) view of bank payments matched to the event's orders. */
export async function listEventBankTransactions(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  query: z.infer<typeof eventBankTransactionQuerySchema>,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const rows = await prisma.bankTransaction.findMany({
    where: {
      matchedEntry: { eventId },
      ...(query.status ? { matchingStatus: query.status } : {}),
    },
    orderBy: [{ bookingDate: 'desc' }, { id: 'asc' }],
  });
  return rows.map(serializeBankTransaction);
}
