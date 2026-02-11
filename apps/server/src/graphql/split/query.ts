import prisma from '../../utils/context.js';

export const competitorSplits = (_, { competitorId }, context) => {
  return prisma.split.findMany({
    where: { competitorId: competitorId },
    orderBy: { time: 'asc' },
  });
};
