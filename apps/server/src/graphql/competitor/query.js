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
export const competitorsByOrganisation = async (_, { eventId, organisation }) => {
  return prisma.competitor.findMany({
    where: {
      class: { is: { eventId } },
      OR: [
        { organisation: { equals: organisation } },
        { shortName:   { equals: organisation } },
      ],
    },
    include: {
      class: true
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  });
};
export const organisations = async (_, { eventId }) => {
  const rows = await prisma.competitor.groupBy({
    by: ['organisation'],
    where: {
      class: { is: { eventId } },
      organisation: { not: null },
    },
    _count: { organisation: true },
    orderBy: { _count: { organisation: 'desc' } },
  });

  return rows
    .filter(r => r.organisation && r.organisation.trim() !== '')
    .map(r => ({ name: r.organisation, competitors: r._count.organisation }));
};
export const searchOrganisations = async (_, { eventId, q }) => {
  const rows = await prisma.competitor.findMany({
    where: {
      class: { is: { eventId } },
      organisation: { contains: q },
    },
    select: { organisation: true },
    distinct: ['organisation'],
    take: 20,
  });
  return rows.filter(r => r.organisation?.trim())
             .map(r => ({ name: r.organisation, competitors: 0 }));
};

