import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type CurrencyFindManySelection = Omit<Prisma.CurrencyFindManyArgs, 'where'>;

export function findCurrencies(
  prisma: AppPrismaClient,
  query: CurrencyFindManySelection = {},
) {
  return prisma.currency.findMany({ ...query, orderBy: { iso4217Alpha3: 'asc' } });
}
