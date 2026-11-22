import { liveMetricsSchema, type LiveMetrics } from '@repo/shared';
import { redisErrors } from './live-status.metrics.js';
import { serialize, deserialize } from 'node:v8';
import { randomUUID } from 'node:crypto';
import { setPubSubForwarder, deliverRemotePublication } from '../../lib/pubsub.js';
const origin = randomUUID();
import { createClient } from 'redis';
import { PubSub } from 'graphql-subscriptions';

export const liveBus = new PubSub();
export const liveTopic = (eventId: string) => `live-status:${eventId}`;
let command: ReturnType<typeof createClient> | undefined;
let subscriber: ReturnType<typeof createClient> | undefined;
export async function startLiveBus(url?: string) {
  if (!url) return;
  command = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 2000 } });
  subscriber = command.duplicate();
  command.on('error', () => redisErrors.inc());
  subscriber.on('error', () => redisErrors.inc());
  void command.connect().catch(() => undefined);
  void subscriber
    .connect()
    .then(async () => {
      await subscriber?.subscribe('ofeed:live-status', (raw) => {
        try {
          const message = JSON.parse(raw.toString()) as { origin: string; eventId: string };
          if (message.origin !== origin && typeof message.eventId === 'string')
            void liveBus.publish(liveTopic(message.eventId), message.eventId);
        } catch {
          /* Ignore malformed notifications. */
        }
      });
      await subscriber?.subscribe('ofeed:results', (raw) => {
        try {
          const message = JSON.parse(raw.toString()) as {
            origin: string;
            topic: string;
            payload: string;
          };
          if (
            message.origin !== origin &&
            typeof message.topic === 'string' &&
            typeof message.payload === 'string'
          )
            void deliverRemotePublication(
              message.topic,
              deserialize(Buffer.from(message.payload, 'base64')),
            );
        } catch {
          /* Ignore malformed bus messages; snapshots reconcile missed notifications. */
        }
      });
    })
    .catch(() => undefined);
  setPubSubForwarder(async (topic, payload) => {
    if (command?.isReady)
      await redisDeadline(
        command.publish(
          'ofeed:results',
          JSON.stringify({ origin, topic, payload: serialize(payload).toString('base64') }),
        ),
      ).catch(() => undefined);
  });
}
export async function notifyLiveStatus(eventId: string) {
  await liveBus.publish(liveTopic(eventId), eventId);
  if (command?.isReady)
    await redisDeadline(
      command.publish('ofeed:live-status', JSON.stringify({ eventId, origin })),
    ).catch(() => undefined);
}
export async function stopLiveBus() {
  setPubSubForwarder(undefined);
  for (const client of [subscriber, command]) if (client?.isOpen) client.destroy();
}

/** Cache only telemetry; authorization, membership and availability always come from SQL. */
export async function cachedTelemetry(
  eventId: string,
  deviceId: string,
  version: number,
  load: () => Promise<{ metrics: unknown; version: number }>,
): Promise<LiveMetrics> {
  const key = `live:event:${eventId}:device:${deviceId}`;
  if (command?.isReady) {
    try {
      const raw = await redisDeadline(command.get(key));
      if (raw) {
        const value = JSON.parse(raw.toString()) as { version: number; metrics: unknown };
        if (value.version === version) return liveMetricsSchema.parse(value.metrics);
      }
    } catch {
      /* SQL is the durable fallback. */
    }
  }
  const value = await load();
  const metrics = liveMetricsSchema.parse(value.metrics);
  if (command?.isReady) {
    const script =
      "local old = redis.call('GET', KEYS[1]); if not old or tonumber(cjson.decode(old).version) <= tonumber(ARGV[1]) then redis.call('SET', KEYS[1], ARGV[2], 'EX', 86400); end; return 1";
    await redisDeadline(
      command.eval(script, {
        keys: [key],
        arguments: [String(value.version), JSON.stringify({ version: value.version, metrics })],
      }),
    ).catch(() => undefined);
  }
  return metrics;
}
async function redisDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Redis notification timeout')), 500);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
