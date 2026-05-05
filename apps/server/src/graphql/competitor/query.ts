import prisma from '../../utils/context.js';
import {
  flattenOrganisation,
  organisationSelect,
} from '../../modules/event/organisation.helpers.js';
import { getCompetitorsByClass } from './shared.js';

export const competitorById = async (_, { id }) => {
  const raw = await prisma.competitor.findUnique({
    where: { id: id },
    include: {
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
      organisation: { select: organisationSelect },
    },
  });
  return flattenOrganisation(raw);
};
export const competitorsByClass = (_, { id }) => {
  return getCompetitorsByClass(id);
};
export const competitorsByTeam = async (_, { id }) => {
  const rows = await prisma.competitor.findMany({
    where: { teamId: id },
    include: { organisation: { select: organisationSelect } },
  });
  return rows.map((r) => flattenOrganisation(r));
};
export const competitorsByOrganisation = async (_, { eventId, organisation, organisationId }) => {
  if (typeof organisationId !== 'number' && !organisation) {
    return [];
  }

  const rows = await prisma.competitor.findMany({
    where: {
      class: { is: { eventId } },
      ...(typeof organisationId === 'number'
        ? { organisationId }
        : {
            organisation: {
              is: {
                eventId,
                OR: [{ name: { equals: organisation } }, { shortName: { equals: organisation } }],
              },
            },
          }),
    },
    include: {
      class: true,
      organisation: { select: organisationSelect },
    },
    orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
  });
  return rows.map((r) => flattenOrganisation(r));
};
export const organisationNames = async (_, { eventId }) => {
  const rows = await prisma.competitor.groupBy({
    by: ['organisationId'],
    where: {
      class: { is: { eventId } },
      organisationId: { not: null },
    },
    _count: { organisationId: true },
    orderBy: { _count: { organisationId: 'desc' } },
  });

  const ids = rows.map((r) => r.organisationId).filter((v): v is number => typeof v === 'number');
  if (ids.length === 0) return [];

  const orgs = await prisma.organisation.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const orgMap = new Map(orgs.map((o) => [o.id, o.name]));
  return rows
    .map((r) => ({
      id: r.organisationId,
      name: r.organisationId ? orgMap.get(r.organisationId) : null,
      competitors: r._count.organisationId,
    }))
    .filter((r): r is { id: number; name: string; competitors: number } => Boolean(r.name));
};
export const searchOrganisationNames = async (_, { eventId, q }) => {
  const rows = await prisma.organisation.findMany({
    where: { eventId, name: { contains: q } },
    select: { name: true },
    distinct: ['name'],
    orderBy: { name: 'asc' },
    take: 20,
  });
  return rows.map((r) => ({ name: r.name, competitors: 0 }));
};
export const organisations = async (_, { eventId }) => {
  return prisma.organisation.findMany({
    where: { eventId },
    orderBy: { name: 'asc' },
  });
};
