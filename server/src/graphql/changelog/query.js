import prisma from '../../utils/context.js';

export const changelogByEvent = (_, { eventId, origin, classId, since }, context) => {
  const filters = { eventId: eventId };

  if (since) {
    filters.createdAt = { gte: new Date(since) };
  }

  if (origin) {
    filters.origin = origin;
  }

  if (classId) {
    filters.competitor = { classId: Number(classId) };
  }

  return prisma.protocol.findMany({
    where: filters,
    orderBy: [
      {
        createdAt: 'asc',
      },
    ],
    include: {
      competitor: true,
      event: true,
      author: {
        select: {
          firstname: true,
          lastname: true,
        },
      },
    },
  });
};
