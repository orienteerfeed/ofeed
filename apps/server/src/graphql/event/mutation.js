import { verifyToken } from '../../utils/jwtToken.js';

export const updateEventVisibility = async (
  _,
  { eventId, published },
  context,
) => {
  if (!context.token) {
    throw new Error('Unauthorized: No token provided');
  }
  const jwtDecoded = verifyToken(context.token);
  if (!jwtDecoded) {
    throw new Error('Unauthorized: Invalid or expired token');
  }
  const { userId } = jwtDecoded;

  try {
    // Check if event exists and user is authorized
    const event = await context.prisma.event.findUnique({
      where: { id: eventId },
      select: { authorId: true },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.authorId !== userId) {
      throw new Error('Not authorized to change event visibility');
    }
    const eventResponse = await context.prisma.event.update({
      where: { id: eventId },
      data: { published, updatedAt: new Date() },
    });

    return {
      message: `Event visibility updated to ${
        published ? 'Public' : 'Private'
      }`,
      eventResponse,
    };
  } catch (error) {
    console.error('Error updating event:', error);
    throw new Error('Failed to update event visibility.');
  }
};
