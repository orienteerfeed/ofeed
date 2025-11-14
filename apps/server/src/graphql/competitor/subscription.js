import {
  pubsub,
  COMPETITORS_BY_CLASS_UPDATED,
  COMPETITOR_UPDATED,
} from '../../utils/pubsub.js';
import { getCompetitorsByClass } from './shared.js';

export const competitorsByClassUpdated = {
  subscribe: async function* (_, { classId }) {
    // Fetch the initial data using the shared function
    const initialData = await getCompetitorsByClass(classId);

    // Yield the initial data to the subscriber
    yield { competitorsByClassUpdated: initialData };

    // Use pubsub.asyncIterableIterator for subsequent updates
    const topic = `${COMPETITORS_BY_CLASS_UPDATED}_${classId}`;
    console.log(`Subscribing to topic: ${topic}`);
    const asyncIterableIterator = pubsub.asyncIterableIterator([topic]);

    // Relay subsequent updates to the subscriber
    for await (const payload of asyncIterableIterator) {
      yield payload;
    }
  },
  resolve: (payload) => {
    // Process and return the payload
    return payload.competitorsByClassUpdated;
  },
};

export const competitorUpdated = {
  subscribe: (_, { eventId }) => {
    console.log(`Subscribing to: COMPETITOR_UPDATED_${eventId}`);
    return pubsub.asyncIterableIterator(`${COMPETITOR_UPDATED}_${eventId}`);
  },
};
