export const requireEventOwner = async (prisma, auth, eventId) => {
  // 1) User must be authenticated (JWT or Basic auth)
  if (!auth || !auth.isAuthenticated) {
    throw new Error('Unauthorized: No credentials provided');
  }

  // 2) If using Basic auth for event access, eventId must match the password's eventId
  //    → ensures event password for Event A cannot be used for Event B
  if (auth.type === 'eventBasic' && auth.eventId !== eventId) {
    throw new Error('Unauthorized: Basic credentials do not match this event');
  }

  // 3) Fetch the event from database
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { authorId: true },
  });

  if (!event) {
    throw new Error('Event not found');
  }

  // 4) Always required (for both JWT and Basic auth): user must be the event author
  if (event.authorId !== auth.userId) {
    throw new Error('Not authorized for this event');
  }

  // Return both event and userId for convenient usage
  return { event, userId: auth.userId };
};
