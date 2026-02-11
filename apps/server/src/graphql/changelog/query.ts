import { requireEventOwner } from '../../utils/authz.js';

export const changelogByEvent = async (_, args, context) => {
  const { eventId, origin, classId, since } = args;
  const { prisma, auth } = context;

  try {
    await requireEventOwner(prisma, auth, eventId);

    const filters = { eventId };

    if (since) {
      filters.createdAt = { gte: new Date(since) };
    }

    if (origin) {
      filters.origin = origin;
    }

    if (classId) {
      filters.competitor = { classId: Number(classId) };
    }

    const result = await prisma.protocol.findMany({
      where: filters,
      orderBy: [{ createdAt: 'asc' }],
      include: {
        competitor: true,
        event: true,
        author: { select: { firstname: true, lastname: true } },
      },
    });

    return result;
  } catch (err) {
    throw new Error(err.message || 'Failed to fetch changelog');
  }
};
