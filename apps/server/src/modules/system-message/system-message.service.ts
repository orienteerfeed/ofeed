import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type SystemMessageFindManySelection = Omit<
  Prisma.SystemMessageFindManyArgs,
  'where' | 'orderBy'
>;

export function findActiveSystemMessages(
  prisma: AppPrismaClient,
  query: SystemMessageFindManySelection = {},
  now = new Date(),
) {
  return prisma.systemMessage.findMany({
    ...query,
    where: {
      publishedAt: {
        not: null,
        lte: now,
      },
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  });
}
