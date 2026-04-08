import prisma from '../../utils/context.js';
export const sports = (parent, _, context) => {
  return prisma.sport.findMany();
};

export const sport = (_, { id }, context) => {
  return prisma.sport.findUnique({
    where: { id: id },
  });
};
