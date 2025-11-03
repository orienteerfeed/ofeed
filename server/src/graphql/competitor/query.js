import prisma from '../../utils/context.js';
import { getCompetitorsByClass } from './shared.js';

export const competitorById = (_, { id }, context) => {
  return prisma.competitor.findUnique({
    where: { id: id },
    include: {
      splits: {
        select: {
          controlCode: true,
          time: true,
        },
      },
      class: {
        select: {
          id: true,
          externalId: true,
          name: true,
          length: true,
          climb: true,
          controlsCount: true,
        },
      },
    },
  });
};
export const competitorsByClass = (_, { id }, context) => {
  return getCompetitorsByClass(id);
};
export const competitorsByTeam = (_, { id }, context) => {
  return prisma.competitor.findMany({
    where: { teamId: id },
  });
};
