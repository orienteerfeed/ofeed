import prisma from '../../utils/context.js';

export const changelogByEvent = (_, { eventId }, context) => {
  return prisma.protocol.findMany({
    where: { eventId: eventId },
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
