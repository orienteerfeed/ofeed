import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type CountryFindManySelection = Omit<Prisma.CountryFindManyArgs, 'where'>;

export function findCountries(
  prisma: AppPrismaClient,
  query: CountryFindManySelection = {},
) {
  return prisma.country.findMany(query);
}

export function findCountryEvents(prisma: AppPrismaClient, countryCode: string) {
  return prisma.event.findMany({
    where: { countryId: countryCode },
  });
}
