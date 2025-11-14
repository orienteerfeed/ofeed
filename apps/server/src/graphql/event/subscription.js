import { pubsub, WINNER_UPDATED } from '../../utils/pubsub.js';

export const winnerUpdated = {
  subscribe: (_, { eventId }) => {
    console.log(`Subscribing to: WINNER_UPDATED_${eventId}`);
    return pubsub.asyncIterableIterator(WINNER_UPDATED(eventId));
  },
};
