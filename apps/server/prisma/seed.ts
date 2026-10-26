import { createPrismaClient } from '../src/db/prisma-client.js';
import { combineEventDateWithZeroTime, normalizeUtcTimeString } from '../src/utils/time.js';

import { seedReferenceData } from './reference-data.js';

const prisma = createPrismaClient();

async function main() {
  const orienteering = await seedReferenceData(prisma);
  const eventName = process.env.EVENT_NAME;
  if (eventName) {
    console.log({ orienteering });
    const dbEventResponse = await prisma.event.findFirst({
      where: {
        name: eventName,
      },
    });
    if (!dbEventResponse) {
      const date = process.env.DATE ?? new Date().toISOString().slice(0, 10);
      const organizer = process.env.ORGANIZER && process.env.ORGANIZER;
      const zeroTimeString = normalizeUtcTimeString(process.env.ZERO_TIME ?? null) ?? '00:00:00';
      const eventDateTime = combineEventDateWithZeroTime(date, zeroTimeString);
      if (!eventDateTime) {
        throw new Error('Invalid DATE or ZERO_TIME environment variable.');
      }
      const location = process.env.LOCATION && process.env.LOCATION;

      const defaultEvent = await prisma.event.create({
        data: {
          name: eventName,
          date: eventDateTime,
          organizer: organizer,
          location: location,
          sportId: 1,
          published: true,
        },
      });
      console.log({ defaultEvent });
    }
  }
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async e => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
