import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type SportFindUniqueSelection = Omit<Prisma.SportFindUniqueArgs, 'where'>;
export type SportFindManySelection = Omit<Prisma.SportFindManyArgs, 'where'>;

export function findSports(prisma: AppPrismaClient, query: SportFindManySelection = {}) {
  return prisma.sport.findMany(query);
}

export function findSportById(
  prisma: AppPrismaClient,
  id: number,
  query: SportFindUniqueSelection = {},
) {
  return prisma.sport.findUnique({
    ...query,
    where: { id },
  });
}
