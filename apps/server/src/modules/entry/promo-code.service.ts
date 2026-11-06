import {
  computePromoDiscount,
  createPromoCodeSchema,
  entryOrderItemInputSchema,
  promoCodeSchema,
} from '@repo/shared';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { ConflictError, ValidationError } from '../../exceptions/index.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import { eventPunchTransaction } from '../punch/punch-write.js';
import { priceCurrentEntryOrder } from './entry.service.js';

export async function resolvePromoCode(
  prisma: AppPrismaClient | Prisma.TransactionClient,
  eventId: string,
  code: string,
) {
  const parsed = promoCodeSchema.safeParse(code);
  if (!parsed.success) throw new ValidationError('PROMO_INVALID');
  const promo = await prisma.promoCode.findUnique({
    where: { eventId_code: { eventId, code: parsed.data } },
  });
  if (!promo || promo.revokedAt) throw new ValidationError('PROMO_INVALID');
  return promo;
}
export async function listPromoCodes(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
) {
  await requireEventOwnerOrAdmin(prisma, auth, eventId);
  return prisma.promoCode.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { entries: true } } },
  });
}
export async function createPromoCode(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
  input: unknown,
) {
  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, eventId);
  const parsed = createPromoCodeSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('PROMO_CONFIGURATION_INVALID');
  try {
    await prisma.promoCode.create({ data: { eventId, ...parsed.data, createdById: userId } });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002')
      throw new ConflictError('PROMO_ALREADY_EXISTS');
    throw error;
  }
  return { message: 'OK' };
}
export async function revokePromoCode(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  eventId: string,
  id: string,
) {
  const { userId } = await requireEventOwnerOrAdmin(prisma, auth, eventId);
  await eventPunchTransaction(prisma, eventId, async (tx) => {
    const result = await tx.promoCode.updateMany({
      where: { id, eventId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: userId },
    });
    if (!result.count) throw new ValidationError('PROMO_INVALID');
  });
  return { message: 'OK' };
}
export async function quoteEntryPromoCode(
  prisma: AppPrismaClient,
  eventId: string,
  code: string,
  input: unknown,
) {
  const parsed = entryOrderItemInputSchema.array().min(1).max(50).safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid entry items.');
  const promo = await resolvePromoCode(prisma, eventId, code);
  const { event, pricedItems } = await priceCurrentEntryOrder(prisma, eventId, {
    items: parsed.data,
  });
  const discount = computePromoDiscount(pricedItems, promo.discountPercent.toNumber());
  if (discount.eligibleAmount <= 0) throw new ValidationError('PROMO_NO_ELIGIBLE_ITEMS');
  return {
    code: promo.code,
    discountPercent: promo.discountPercent.toNumber(),
    currency: event.currency.iso4217Alpha3,
    ...discount,
  };
}
