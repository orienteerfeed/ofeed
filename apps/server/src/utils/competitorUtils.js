import prisma from './context.js';

export async function isExternalIdUnique(eventId, externalId) {
  const existingCompetitor = await prisma.competitor.findFirst({
    where: {
      class: {
        eventId: eventId,
      },
      externalId: externalId,
    },
  });

  return !existingCompetitor; // true = unique, false = already exists
}
