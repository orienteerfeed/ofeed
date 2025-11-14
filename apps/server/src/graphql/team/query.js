import prisma from '../../utils/context.js';
export const teamById = (_, { id }, context) => {
  return prisma.team.findUnique({
    where: { id: id },
  });
};
export const teamsByClass = (_, { classId }, context) => {
  return prisma.team.findMany({
    where: { classId: classId },
  });
};
