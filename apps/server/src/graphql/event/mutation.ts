import { requireEventOwnerOrAdmin } from '../../utils/authz.js';

export const updateEventVisibility = async (_, { eventId, published }, context) => {
  try {
    const { prisma, auth } = context;

    await requireEventOwnerOrAdmin(prisma, auth, eventId);

    const event = await prisma.event.update({
      where: { id: eventId },
      data: { published, updatedAt: new Date() },
    });

    return {
      message: `Event visibility updated to ${published ? 'Public' : 'Private'}`,
      event,
    };
  } catch (error) {
    console.error('Error updating event visibility:', error);
    throw new Error(error.message || 'Failed to update event visibility.');
  }
};
