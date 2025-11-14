import {
  pubsub,
  COMPETITORS_BY_CLASS_UPDATED,
  COMPETITOR_UPDATED,
} from './pubsub.js';
import prisma from './context.js';

/**
 * Publish updated competitors by class to subscribers
 * @param {number} classId - The ID of the class
 */
export const publishUpdatedCompetitors = async (classId) => {
  try {
    const updatedCompetitors = await prisma.competitor.findMany({
      where: { classId },
    });

    const topic = `${COMPETITORS_BY_CLASS_UPDATED}_${classId}`;
    console.log('Publishing to topic:', topic);

    pubsub.publish(topic, {
      competitorsByClassUpdated: updatedCompetitors,
    });
  } catch (err) {
    console.error('Failed to publish subscription update:', err);
    throw new Error('Error publishing subscription update');
  }
};

export const publishUpdatedCompetitor = async (eventId, updatedCompetitor) => {
  try {
    const topic = `${COMPETITOR_UPDATED}_${eventId}`;
    console.log('Publishing to topic:', topic);

    pubsub.publish(topic, {
      competitorUpdated: updatedCompetitor,
    });
  } catch (err) {
    console.error('Failed to publish subscription update:', err);
    throw new Error('Error publishing subscription update');
  }
};
