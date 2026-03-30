import prisma from '../../utils/context.js';

export const activeSystemMessages = async () => {
  const now = new Date();

  return prisma.systemMessage.findMany({
    where: {
      publishedAt: {
        lte: now,
      },
      OR: [
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            gt: now,
          },
        },
      ],
    },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  });
};
