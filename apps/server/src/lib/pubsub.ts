import { PubSub } from 'graphql-subscriptions';

// Create PubSub instance (ensure you reuse this across your app)
export const pubsub = new PubSub();

// Define the subscription topic constant
export const COMPETITORS_BY_CLASS_UPDATED = 'COMPETITORS_BY_CLASS_UPDATED';
export const COMPETITOR_UPDATED = 'COMPETITOR_UPDATED';
export const WINNER_UPDATED = (eventId: string | number): string => `WINNER_UPDATED_${eventId}`;
export const CLASSES_UPDATED = (eventId: string): string => `CLASSES_UPDATED_${eventId}`;

/** Signals that class settings of an event changed; subscribers refetch the event. */
export const publishClassesUpdated = (eventId: string): void => {
  pubsub.publish(CLASSES_UPDATED(eventId), { classesUpdated: eventId });
};
