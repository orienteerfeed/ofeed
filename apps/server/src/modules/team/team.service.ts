import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  flattenOrganisation,
  organisationSelect,
} from '../event/organisation.helpers.js';

export type TeamFindUniqueSelection = Omit<Prisma.TeamFindUniqueArgs, 'where'>;
export type TeamFindManySelection = Omit<Prisma.TeamFindManyArgs, 'where'>;

export function findTeamById(
  prisma: AppPrismaClient,
  id: number,
  query: TeamFindUniqueSelection = {},
) {
  return prisma.team.findUnique({
    ...query,
    where: { id },
  });
}

export function findTeamsByClass(
  prisma: AppPrismaClient,
  classId: number,
  query: TeamFindManySelection = {},
) {
  return prisma.team.findMany({
    ...query,
    where: { classId },
  });
}

export async function findTeamByIdWithOrganisation(prisma: AppPrismaClient, id: number) {
  const team = await findTeamById(prisma, id, {
    include: { organisation: { select: organisationSelect } },
  });

  return flattenOrganisation(team);
}

export async function findTeamsByClassWithOrganisation(prisma: AppPrismaClient, classId: number) {
  const teams = await findTeamsByClass(prisma, classId, {
    include: { organisation: { select: organisationSelect } },
  });

  return teams.map((team) => flattenOrganisation(team));
}

export function findTeamCompetitors(prisma: AppPrismaClient, teamId: number) {
  return prisma.competitor.findMany({
    where: { teamId },
  });
}
