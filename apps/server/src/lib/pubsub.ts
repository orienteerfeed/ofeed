import { EventEmitter } from 'node:events';
import { PubSub } from 'graphql-subscriptions';
import { logger } from './logging.js';

// One listener per live subscriber on a topic, so popular classes legitimately exceed Node's default of 10.
const eventEmitter = new EventEmitter();
eventEmitter.setMaxListeners(0);

// Create PubSub instance (ensure you reuse this across your app)
export const pubsub = new PubSub({ eventEmitter });
const localPublish = pubsub.publish.bind(pubsub);
let forward: ((topic: string, payload: unknown) => Promise<void>) | undefined;
export function setPubSubForwarder(value: typeof forward) {
  forward = value;
}
export const deliverRemotePublication = (topic: string, payload: unknown) =>
  localPublish(topic, payload);
pubsub.publish = async (topic: string, payload: unknown) => {
  await localPublish(topic, payload);
  // Cross-replica fan-out is best effort; it must never reject callers that fire-and-forget publish.
  await forward?.(topic, payload).catch((error: unknown) => {
    logger.warn('PubSub: remote forward failed', {
      topic,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
  });
};

// Define the subscription topic constant
export const COMPETITORS_BY_CLASS_UPDATED = 'COMPETITORS_BY_CLASS_UPDATED';
export const COMPETITOR_UPDATED = 'COMPETITOR_UPDATED';
export const WINNER_UPDATED = (eventId: string | number): string => `WINNER_UPDATED_${eventId}`;
export const CLASSES_UPDATED = (eventId: string): string => `CLASSES_UPDATED_${eventId}`;

/** Signals that class settings of an event changed; subscribers refetch the event. */
export const publishClassesUpdated = (eventId: string): void => {
  pubsub.publish(CLASSES_UPDATED(eventId), { classesUpdated: eventId });
};

/**
 * Yields `initial()` first, then `onEvent(payload)` for every publish on `topic`.
 * Subscribes before the initial fetch so no update is lost in between. Unlike a plain
 * async generator wrapper, `return()` unsubscribes immediately instead of leaving the
 * listener attached until the next publish on the topic.
 */
export function subscribeWithInitial<TPayload, TResult>(
  topic: string,
  initial: () => Promise<TResult>,
  onEvent: (payload: TPayload) => TResult | Promise<TResult>,
  pubsubInstance: typeof pubsub = pubsub,
): AsyncIterableIterator<TResult> {
  const source = pubsubInstance.asyncIterableIterator<TPayload>(topic);

  async function* run(): AsyncGenerator<TResult> {
    try {
      yield await initial();
      for await (const payload of source as AsyncIterable<TPayload>) {
        yield await onEvent(payload);
      }
    } finally {
      await source.return?.();
    }
  }

  const generator = run();

  return {
    next: () => generator.next(),
    return: async (value?: unknown) => {
      await source.return?.();
      return generator.return(value as TResult);
    },
    throw: (error?: unknown) => generator.throw(error),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
