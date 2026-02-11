import { requireEventOwner } from '../../utils/authz.js';

export const updateEventVisibility = async (_, { eventId, published }, context) => {
  try {
    const { prisma, auth } = context;

    await requireEventOwner(prisma, auth, eventId);

    const eventResponse = await prisma.event.update({
      where: { id: eventId },
      data: { published, updatedAt: new Date() },
    });

    return {
      message: `Event visibility updated to ${published ? 'Public' : 'Private'}`,
      eventResponse,
    };
  } catch (error) {
    console.error('Error updating event visibility:', error);
    throw new Error(error.message || 'Failed to update event visibility.');
  }
};
