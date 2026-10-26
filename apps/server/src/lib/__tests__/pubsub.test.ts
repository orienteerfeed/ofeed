import { EventEmitter } from 'node:events';
import { PubSub } from 'graphql-subscriptions';
import { describe, expect, it } from 'vitest';

import { subscribeWithInitial } from '../pubsub.js';

describe('subscribeWithInitial', () => {
  it('yields initial value, then events, and unsubscribes immediately on return()', async () => {
    const eventEmitter = new EventEmitter();
    const pubsub = new PubSub({ eventEmitter });
    const iterator = subscribeWithInitial(
      'T',
      async () => 'initial',
      (payload: string) => `event:${payload}`,
      pubsub,
    );

    expect(await iterator.next()).toEqual({ value: 'initial', done: false });
    const pending = iterator.next();
    await pubsub.publish('T', 'a');
    expect(await pending).toEqual({ value: 'event:a', done: false });

    const waiting = iterator.next(); // client is idle, waiting for the next publish
    expect(eventEmitter.listenerCount('T')).toBe(1);

    await iterator.return?.();
    expect(eventEmitter.listenerCount('T')).toBe(0);
    expect(await waiting).toEqual({ value: undefined, done: true });
  });

  it('unsubscribes when the initial load throws', async () => {
    const eventEmitter = new EventEmitter();
    const pubsub = new PubSub({ eventEmitter });
    const iterator = subscribeWithInitial(
      'T',
      async () => {
        throw new Error('forbidden');
      },
      (payload: string) => payload,
      pubsub,
    );

    await expect(iterator.next()).rejects.toThrow('forbidden');
    expect(eventEmitter.listenerCount('T')).toBe(0);
  });
});
