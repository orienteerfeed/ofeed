import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';

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
