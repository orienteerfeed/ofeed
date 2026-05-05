import prisma from '../../utils/context.js';
import {
  flattenOrganisation,
  organisationSelect,
} from '../../modules/event/organisation.helpers.js';

export const teamById = async (_, { id }) => {
  const raw = await prisma.team.findUnique({
    where: { id: id },
    include: { organisation: { select: organisationSelect } },
  });
  return flattenOrganisation(raw);
};
export const teamsByClass = async (_, { id, classId }) => {
  const rows = await prisma.team.findMany({
    where: { classId: classId ?? id },
    include: { organisation: { select: organisationSelect } },
  });
  return rows.map((r) => flattenOrganisation(r));
};
