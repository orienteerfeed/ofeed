import { classUpdateInputSchema } from '@repo/shared';

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

/**
 * Partial update of a class's editable configuration. Validates input with the
 * shared `classUpdateInputSchema` (including cross-field age / team-size
 * constraints and 2-decimal fee limit), authorises against the owning event,
 * and persists only the fields the caller supplied. Passing `null` for a
 * nullable field clears it; omitting a field leaves it unchanged.
 */
export async function updateClassForGraphQL(
  prisma: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
) {
  const parsed = classUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid class update input.');
  }

  const { classId, ...fields } = parsed.data;

  const eventClass = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      eventId: true,
      minAge: true,
      maxAge: true,
      minTeamMembers: true,
      maxTeamMembers: true,
    },
  });

  if (!eventClass) {
    throw new Error('Class not found');
  }

  await requireEventOwnerOrAdmin(prisma, auth, eventClass.eventId);

  const merged = classUpdateInputSchema.safeParse({
    ...parsed.data,
    minAge: fields.minAge === undefined ? eventClass.minAge : fields.minAge,
    maxAge: fields.maxAge === undefined ? eventClass.maxAge : fields.maxAge,
    minTeamMembers:
      fields.minTeamMembers === undefined ? eventClass.minTeamMembers : fields.minTeamMembers,
    maxTeamMembers:
      fields.maxTeamMembers === undefined ? eventClass.maxTeamMembers : fields.maxTeamMembers,
  });
  if (!merged.success) {
    throw new ValidationError(merged.error.issues[0]?.message ?? 'Invalid class update input.');
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      data[key] = value;
    }
  }

  await prisma.class.update({
    where: { id: eventClass.id },
    data: data as Prisma.ClassUpdateInput,
  });

  return { message: 'Class updated' };
}
