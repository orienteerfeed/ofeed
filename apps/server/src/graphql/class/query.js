import prisma from '../../utils/context.js';
export const classById = (_, { id }, context) => {
  return prisma.class.findUnique({
    where: { id: id },
  });
};
export const eventClasses = (_, { eventId }, context) => {
  return prisma.class.findMany({
    where: { eventId: eventId },
  });
};

export const eventClassesByIds = (_, { eventId, ids }, context) => {
  return prisma.class.findMany({
    where: { eventId: eventId, id: { in: ids } },
  });
};
