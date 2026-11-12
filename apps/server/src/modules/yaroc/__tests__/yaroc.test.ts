import { describe, expect, it } from 'vitest';
import { timezoneOffset, loadYaroc } from '../yaroc.service.js';
import { stablePunchId } from '../yaroc.worker.js';
import { z } from 'zod';
describe('YAROC adapter boundaries', () => {
  it('derives DST-sensitive offsets from event zones', () => {
    expect(timezoneOffset('Europe/Prague', new Date('2026-07-01T12:00:00Z'))).toBe('+02:00');
    expect(timezoneOffset('Europe/Prague', new Date('2026-12-01T12:00:00Z'))).toBe('+01:00');
    expect(timezoneOffset('UTC', new Date())).toBe('+00:00');
  });
  it('creates stable UUID receipt identities across worker restarts', () => {
    const id = stablePunchId('device/123/31/2026-07-01T12:00:00Z');
    expect(z.string().uuid().parse(id)).toBe(id);
    expect(stablePunchId('device/123/31/2026-07-01T12:00:00Z')).toBe(id);
    expect(stablePunchId('device/123/32/2026-07-01T12:00:00Z')).not.toBe(id);
  });
  it('reports an unavailable native distribution without crashing importers', async () => {
    // Current npm 0.1.3 is incomplete. Skip this assertion once upstream republishes functional artifacts.
    const result = await loadYaroc().catch((e: unknown) => e);
    if (result instanceof Error) expect(result.message).toContain('native entrypoint unavailable');
    else expect(result).toHaveProperty('MqttClient');
  });
});
