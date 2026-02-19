import prisma from '../../utils/context.js';

function getAuthenticatedUserId(context) {
  const { auth } = context;

  if (!auth?.isAuthenticated || !auth.userId) {
    throw new Error('Unauthorized: Invalid or missing credentials');
  }

  const userId = Number(auth.userId);
  if (!Number.isFinite(userId)) {
    throw new Error('Unauthorized: Invalid user identifier');
  }

  return userId;
}

export const currentUser = (_, {}, context) => {
  const userId = getAuthenticatedUserId(context);

  return prisma.user.findUnique({
    where: { id: userId },
  });
};

export const myEvents = (_, {}, context) => {
  const userId = getAuthenticatedUserId(context);

  return prisma.event.findMany({ where: { authorId: userId } });
};

export const currentUserCards = (_, {}, context) => {
  const userId = getAuthenticatedUserId(context);

  return prisma.userCard.findMany({
    where: { userId },
    include: { sport: true },
    orderBy: [{ sportId: 'asc' }, { isDefault: 'desc' }, { updatedAt: 'desc' }],
  });
};
