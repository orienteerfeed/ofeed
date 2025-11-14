import { pubsub, WINNER_UPDATED } from '../../utils/pubsub.js';
import prisma from '../../utils/context.js';

// Cache to track event winners
const winnersCache = new Map(); // Map<eventId, Map<classId, competitorId>>

export const notifyWinnerChanges = async (eventId) => {
  try {
    const latestWinners = await prisma.competitor.findMany({
      where: { class: { eventId }, time: { not: null }, status: 'OK' },
      select: {
        classId: true,
        class: { select: { name: true } },
        id: true,
        firstname: true,
        lastname: true,
        time: true,
      },
      orderBy: { time: 'asc' },
      distinct: ['classId'],
    });

    let previousWinners = winnersCache.get(eventId);

    // If no cache exists, initialize it (but DO NOT publish notifications)
    if (!previousWinners) {
      previousWinners = new Map();
      latestWinners.forEach((winner) => {
        previousWinners.set(winner.classId, winner.id);
      });

      winnersCache.set(eventId, previousWinners);
      console.log(`⚠️ Initializing winners cache for event ${eventId}`);
      return;
    }

    let winnerChanges = [];
    for (const newWinner of latestWinners) {
      const oldWinner = previousWinners.get(newWinner.classId);

      if (!oldWinner || oldWinner !== newWinner.id) {
        winnerChanges.push({
          classId: newWinner.classId,
          className: newWinner.class.name,
          competitorId: newWinner.id,
          name: `${newWinner.lastname} ${newWinner.firstname}`,
        });

        // Update cache
        previousWinners.set(newWinner.classId, newWinner.id);
      }
    }

    // Save the updated cache
    winnersCache.set(eventId, previousWinners);

    if (winnerChanges.length > 0) {
      winnerChanges.forEach((winner) => {
        console.log(
          `Publishing WINNER_UPDATED(${eventId}) for class ${winner.className}`,
        );

        pubsub.publish(WINNER_UPDATED(eventId), {
          winnerUpdated: {
            eventId,
            classId: winner.classId,
            className: winner.className,
            name: winner.name,
          },
        });
      });
    }
  } catch (error) {
    console.error('Error detecting winner changes:', error);
  }
};
