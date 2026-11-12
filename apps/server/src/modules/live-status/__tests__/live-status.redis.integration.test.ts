import { randomUUID } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createClient } from 'redis';
import { cachedTelemetry, startLiveBus, stopLiveBus } from '../live-status.bus.js';
import { pubsub } from '../../../lib/pubsub.js';
const url = process.env.LIVE_STATUS_TEST_REDIS_URL;
if (url) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.port !== '16389')
    throw new Error('Use disposable local Redis on port 16389');
}
describe.skipIf(!url)('live status Redis transport', () => {
  const external = createClient({ url });
  afterAll(async () => {
    await stopLiveBus();
    if (external.isOpen) external.destroy();
  });
  it('version-checks cached telemetry, transports Date payloads and falls back to SQL', async () => {
    await external.connect();
    await startLiveBus(url);
    const eventId = randomUUID(),
      deviceId = randomUUID();
    const key = `live:event:${eventId}:device:${deviceId}`;
    const load = vi.fn().mockResolvedValue({ version: 1, metrics: { batteryPercent: 0 } });
    await vi.waitFor(async () => {
      await cachedTelemetry(eventId, deviceId, 1, load);
      expect(await external.exists(key)).toBe(1);
    });
    load.mockClear();
    expect(await cachedTelemetry(eventId, deviceId, 1, load)).toEqual({ batteryPercent: 0 });
    expect(load).not.toHaveBeenCalled();
    load.mockResolvedValue({ version: 2, metrics: { batteryPercent: 40 } });
    expect(await cachedTelemetry(eventId, deviceId, 2, load)).toEqual({ batteryPercent: 40 });
    expect(load).toHaveBeenCalledOnce();
    // Simulate a different API process publishing onto the shared bus.
    await vi.waitFor(async () => {
      const counts = await external.sendCommand(['PUBSUB', 'NUMSUB', 'ofeed:results']);
      expect(Number(counts[1])).toBeGreaterThan(0);
    });
    const topic = `test:${eventId}`;
    const listener = pubsub.asyncIterableIterator<{ time: Date }>(topic);
    const pending = listener.next();
    const time = new Date('2026-11-10T10:00:00Z');
    await external.publish(
      'ofeed:results',
      JSON.stringify({
        origin: 'other-api',
        topic,
        payload: serialize({ time }).toString('base64'),
      }),
    );
    expect((await pending).value.time).toEqual(time);
    await listener.return?.();
    const observer = external.duplicate();
    await observer.connect();
    let forwarded: Date | undefined;
    await observer.subscribe('ofeed:results', (raw) => {
      const message = JSON.parse(raw);
      if (message.topic === topic)
        forwarded = (deserialize(Buffer.from(message.payload, 'base64')) as { time: Date }).time;
    });
    await pubsub.publish(topic, { time });
    await vi.waitFor(() => expect(forwarded).toEqual(time));
    observer.destroy();
    await stopLiveBus();
    load.mockClear();
    expect(await cachedTelemetry(eventId, deviceId, 2, load)).toEqual({ batteryPercent: 40 });
    expect(load).toHaveBeenCalledOnce();
    await external.del(key);
  });
});
