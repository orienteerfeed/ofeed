import { PubSub } from 'graphql-subscriptions';

// Create PubSub instance (ensure you reuse this across your app)
export const pubsub = new PubSub();

// Define the subscription topic constant
export const COMPETITORS_BY_CLASS_UPDATED = 'COMPETITORS_BY_CLASS_UPDATED';
export const COMPETITOR_UPDATED = 'COMPETITOR_UPDATED';
export const WINNER_UPDATED = (eventId) => `WINNER_UPDATED_${eventId}`;
