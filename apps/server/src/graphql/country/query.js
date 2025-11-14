import prisma from '../../utils/context.js';
export const countries = (parent, _, context) => {
  return prisma.country.findMany();
};
