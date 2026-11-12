import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext, AppBindings } from '../../../types/index.js';
vi.mock('../live-status.service.js', () => ({
  tokenHash: (v: string) => `hash:${v}`,
  ingestHeartbeat: vi
    .fn()
    .mockResolvedValue({ duplicate: false, receivedAt: '2026-11-10T10:00:00Z' }),
}));
import { ingestHeartbeat } from '../live-status.service.js';
import router from '../live-status.routes.js';
const findUnique = vi.fn();
const upsert = vi.fn();
const db = { liveDevice: { findUnique, upsert } };
function app(auth?: AuthContext) {
  const app = new Hono<AppBindings>();
  // Match the production catch-all handler, which does not preserve thrown HTTP status.
  app.onError((_, c) => c.json({ error: true }, 500));
  app.use('*', async (c, next) => {
    if (auth) c.set('authContext', auth);
    c.set('prisma', db as unknown as AppBindings['Variables']['prisma']);
    await next();
  });
  return app.route('/', router);
}
const token = 'A'.repeat(43);
const body = {
  version: 1,
  messageId: 'f9e5f5b0-5540-49e2-a719-6c7db9a36fed',
  measuredAt: '2026-11-10T10:00:00Z',
  metrics: { batteryPercent: 0 },
};
function request(authorization = `Bearer ${token}`, payload: unknown = body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(payload),
  };
}
describe('external heartbeat REST boundary', () => {
  beforeEach(() => {
    vi.mocked(ingestHeartbeat).mockClear();
    upsert.mockReset();
    findUnique.mockClear();
    upsert.mockResolvedValue({
      id: 'auto-device',
      eventId: 'race',
      sourceType: 'quickevent',
      sourceId: 'f9e5f5b0-5540-49e2-a719-6c7db9a36fed',
      revokedAt: null,
    });
    findUnique.mockResolvedValue({ id: 'device', eventId: 'race', revokedAt: null });
  });
  it('rejects absent tokens and cross-event writes', async () => {
    expect((await app().request('/race/live-status/heartbeat', request(''))).status).toBe(401);
    expect((await app().request('/other/live-status/heartbeat', request())).status).toBe(401);
    expect(ingestHeartbeat).not.toHaveBeenCalled();
  });
  it('acknowledges only after scoped ingest and retains the response envelope', async () => {
    const response = await app().request('/race/live-status/heartbeat', request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      error: false,
      results: { data: { duplicate: false } },
    });
    expect(ingestHeartbeat).toHaveBeenCalledWith(db, 'device', body);
  });
  it.each(['application/json', 'text/plain'])(
    'returns a non-retriable 400 for malformed JSON (%s)',
    async (contentType) => {
      const response = await app().request('/race/live-status/heartbeat', {
        ...request(),
        headers: { 'Content-Type': contentType, Authorization: `Bearer ${token}` },
        body: '{"version":',
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: true, code: 400 });
      expect(ingestHeartbeat).not.toHaveBeenCalled();
    },
  );
  it('registers on first event-password heartbeat without changing the heartbeat envelope', async () => {
    const identity = { sourceType: 'quickevent', sourceId: body.messageId };
    const auth = { isAuthenticated: true, type: 'eventBasic' as const, eventId: 'race', userId: 1 };
    const response = await app(auth).request(
      '/race/live-status/heartbeat',
      request('Basic credentials', { ...body, ...identity }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      error: false,
      results: { data: { duplicate: false } },
    });
    expect(upsert).toHaveBeenCalledOnce();
    expect(findUnique).not.toHaveBeenCalled();
    expect(ingestHeartbeat).toHaveBeenCalledWith(db, 'auto-device', body);
  });
  it('preserves bearer clients that send extra legacy metadata', async () => {
    const response = await app().request(
      '/race/live-status/heartbeat',
      request(undefined, { ...body, sourceType: 'legacy-exporter', sourceId: 'non-uuid' }),
    );
    expect(response.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
    expect(ingestHeartbeat).toHaveBeenCalledWith(db, 'device', body);
  });
  it('supports explicit idempotent registration and rejects wrong-event or expired credentials', async () => {
    const identity = { sourceType: 'quickevent', sourceId: body.messageId };
    const auth = { isAuthenticated: true, type: 'eventBasic' as const, eventId: 'race', userId: 1 };
    const response = await app(auth).request(
      '/race/live-status/devices',
      request('Basic credentials', identity),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: { data: { deviceId: 'auto-device' } } });
    expect(upsert.mock.calls[0][0].update).toEqual({});
    upsert.mockClear();
    expect(
      (
        await app(auth).request(
          '/other/live-status/devices',
          request('Basic credentials', identity),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await app({ isAuthenticated: false, type: null }).request(
          '/race/live-status/devices',
          request('Basic expired', identity),
        )
      ).status,
    ).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('does not reactivate revoked application identities', async () => {
    upsert.mockResolvedValue({ id: 'auto-device', revokedAt: new Date() });
    const auth = { isAuthenticated: true, type: 'eventBasic' as const, eventId: 'race', userId: 1 };
    const response = await app(auth).request(
      '/race/live-status/devices',
      request('Basic credentials', { sourceType: 'quickevent', sourceId: body.messageId }),
    );
    expect(response.status).toBe(403);
    expect(ingestHeartbeat).not.toHaveBeenCalled();
  });
  it('rejects revoked credentials and invalid battery values', async () => {
    findUnique.mockResolvedValue({ id: 'device', eventId: 'race', revokedAt: new Date() });
    expect((await app().request('/race/live-status/heartbeat', request())).status).toBe(401);
    const invalid = await app().request(
      '/race/live-status/heartbeat',
      request(undefined, { ...body, metrics: { batteryPercent: 101 } }),
    );
    expect(invalid.status).toBeGreaterThanOrEqual(400);
    expect(ingestHeartbeat).not.toHaveBeenCalled();
  });
});
