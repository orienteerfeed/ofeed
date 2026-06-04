import type { AppPrismaClient } from '../../db/prisma-client.js';
import { ValidationError } from '../../exceptions/index.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';

export type ClassFindUniqueSelection = Omit<Prisma.ClassFindUniqueArgs, 'where'>;
export type ClassFindManySelection = Omit<Prisma.ClassFindManyArgs, 'where'>;

export function findClassById(
  prisma: AppPrismaClient,
  id: number,
  query: ClassFindUniqueSelection = {},
) {
  return prisma.class.findUnique({
    ...query,
    where: { id },
  });
}

export function findEventClasses(
  prisma: AppPrismaClient,
  eventId: string,
  query: ClassFindManySelection = {},
) {
  return prisma.class.findMany({
    ...query,
    where: { eventId },
  });
}

export function findEventClassesByIds(
  prisma: AppPrismaClient,
  eventId: string,
  ids: number[] | null | undefined,
  query: ClassFindManySelection = {},
) {
  return prisma.class.findMany({
    ...query,
    where: { eventId, id: { in: ids ?? undefined } },
  });
}

export function findClassCompetitors(prisma: AppPrismaClient, classId: number) {
  return prisma.competitor.findMany({
    where: { classId },
  });
}

export function findClassTeams(prisma: AppPrismaClient, classId: number) {
  return prisma.team.findMany({
    where: { classId },
  });
}

export interface UpdateClassFeeInput {
  classId: number;
  /** Gross entry fee (incl. VAT), or null to clear the fee. */
  fee: number | null;
}

function validateClassFee(fee: number | null): void {
  if (fee === null) return;

  if (!Number.isFinite(fee)) {
    throw new ValidationError('Class fee must be a finite number.');
  }

  if (fee < 0) {
    throw new ValidationError('Class fee must be greater than or equal to 0.');
  }

  if (!Number.isInteger(fee * 100)) {
    throw new ValidationError('Class fee can have at most 2 decimal places.');
  }
}

/**
 * Sets the base entry fee on a class. Authorises against the owning event so
 * only the event owner or an admin can change pricing.
 */
export async function updateClassFeeForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: UpdateClassFeeInput,
) {
  validateClassFee(input.fee);

  const eventClass = await prisma.class.findUnique({
    where: { id: input.classId },
    select: { id: true, eventId: true },
  });

  if (!eventClass) {
    throw new Error('Class not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, eventClass.eventId);

  await prisma.class.update({
    where: { id: eventClass.id },
    data: { fee: input.fee },
  });

  return { message: 'Class fee updated' };
}
