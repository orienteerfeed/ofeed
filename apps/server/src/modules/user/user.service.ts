import type { AppPrismaClient } from '../../db/prisma-client.js';
import { getEventStatusSummary } from '../event/event.status.service.js';
import prisma from '../../utils/context.js';
import { formatUtcDateTimeRfc3339 } from '../../utils/time.js';

export async function listMyEvents(userId: number | string) {
  const events = await prisma.event.findMany({
    where: { authorId: userId as number },
    select: {
      id: true,
      name: true,
      organizer: true,
      date: true,
      location: true,
      relay: true,
      published: true,
      timezone: true,
      entriesOpenAt: true,
      entriesCloseAt: true,
      resultsOfficialAt: true,
      resultsOfficialManuallySetAt: true,
      externalSource: true,
      externalEventId: true,
    },
  });

  return Promise.all(
    events.map(async (event) => {
      const statusSummary = await getEventStatusSummary(prisma as AppPrismaClient, event);

      return {
        id: event.id,
        name: event.name,
        organizer: event.organizer,
        date: formatUtcDateTimeRfc3339(event.date) ?? event.date,
        location: event.location,
        relay: event.relay,
        published: event.published,
        statusSummary: {
          primary: statusSummary.primary,
        },
      };
    }),
  );
}
