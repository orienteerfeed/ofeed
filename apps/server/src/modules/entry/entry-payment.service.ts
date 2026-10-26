import type { z } from '@hono/zod-openapi';
import type { EntryPaymentInsight } from '@repo/shared';

import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ConflictError, ValidationError } from '../../exceptions/index.js';
import { Prisma, type EntryPayment } from '../../generated/prisma/client.js';
import { AuthzError, requireEventOwnerOrAdmin, type AuthzAuthContext } from '../../utils/authz.js';
import { createEntryPaymentSchema, entryPaymentQuerySchema } from './entry-payment.schema.js';
import { entryPaymentTransaction, reconcileEntryPaymentState } from './entry-payment-write.js';

function serialize(payment: EntryPayment) {
  return {
    ...payment,
    amount: payment.amount.toNumber(),
    paidAt: payment.paidAt.toISOString(),
    recordedAt: payment.recordedAt.toISOString(),
  };
}

async function authorize(prisma: AppPrismaClient, auth: AuthzAuthContext, eventId: string) {
  if (!auth?.isAuthenticated || auth.type !== 'jwt') {
    throw new AuthzError('User JWT required', 401);
  }
  return requireEventOwnerOrAdmin(prisma, auth, eventId);
}

export async function listPaymentInsights(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
): Promise<EntryPaymentInsight[]> {
  await authorize(prisma, auth, eventId);
  const payments = await prisma.entryPayment.findMany({
    where: { eventId },
    include: {
      entry: { select: { paymentReference: true, contactFirstname: true, contactLastname: true } },
    },
    orderBy: [{ paidAt: 'desc' }, { id: 'asc' }],
  });
  return payments.map(({ entry, ...payment }) => ({ ...serialize(payment), ...entry }));
}

export async function recordEntryPayment(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  entryId: string,
  input: z.infer<typeof createEntryPaymentSchema>,
) {
  const { userId } = await authorize(prisma, auth, eventId);
  const parsed = createEntryPaymentSchema.parse(input);
  const data = { ...parsed, clientPaymentId: parsed.clientPaymentId.toLowerCase() };
  const amount = new Prisma.Decimal(data.amount.toFixed(2));
  const paidAt = new Date(data.paidAt);
  const where = { eventId_clientPaymentId: { eventId, clientPaymentId: data.clientPaymentId } };
  const replay = (existing: EntryPayment) => {
    if (
      existing.entryId !== entryId ||
      existing.method !== data.method ||
      !existing.amount.equals(amount) ||
      existing.currency !== data.currency ||
      existing.paidAt.getTime() !== paidAt.getTime() ||
      existing.deviceId !== data.deviceId
    ) {
      throw new ConflictError('clientPaymentId already used with a different payment payload.');
    }
    return { payment: serialize(existing), created: false };
  };
  try {
    return await entryPaymentTransaction(prisma, eventId, entryId, async (tx) => {
      const existing = await tx.entryPayment.findUnique({ where });
      if (existing) return replay(existing);
      const entry = await tx.entry.findUniqueOrThrow({ where: { id: entryId } });
      if (entry.currency !== data.currency) {
        throw new ValidationError('Payment currency must match the entry currency.');
      }
      const payment = await tx.entryPayment.create({
        data: { ...data, amount, paidAt, eventId, entryId, operatorId: userId },
      });
      await reconcileEntryPaymentState(tx, eventId, entryId, userId);
      return { payment: serialize(payment), created: true };
    });
  } catch (cause) {
    // The unique index arbitrates simultaneous retries, including across entries/devices.
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
      const winner = await prisma.entryPayment.findUnique({ where });
      if (winner) return replay(winner);
    }
    throw cause;
  }
}

export async function listEntryPayments(
  prisma: AppPrismaClient,
  auth: AuthzAuthContext,
  eventId: string,
  input: z.infer<typeof entryPaymentQuerySchema>,
) {
  await authorize(prisma, auth, eventId);
  const query = entryPaymentQuerySchema.parse(input);
  const payments = await prisma.entryPayment.findMany({
    where: {
      eventId,
      ...(query.entryId !== undefined ? { entryId: query.entryId } : {}),
      ...(query.deviceId !== undefined ? { deviceId: query.deviceId } : {}),
      ...(query.since !== undefined ? { recordedAt: { gte: new Date(query.since) } } : {}),
    },
    orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
  });
  return payments.map(serialize);
}
