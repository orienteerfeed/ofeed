import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '../../../types/index.js';
import { AuthzError } from '../../../utils/authz.js';

vi.mock('../punch.service.js', () => ({
  ingestPunches: vi.fn(),
  PunchConflictError: class extends Error {},
}));
import { ingestPunches, PunchConflictError } from '../punch.service.js';
import router from '../punch.routes.js';

const body = {
  source: 'SRR',
  deviceId: 'reader',
  punches: [
    {
      clientPunchId: 'b42c66e5-98f7-4f1b-9fd6-0d436660b624',
      card: 8123456,
      controlCode: 31,
      punchTime: '2026-05-17T11:26:15+02:00',
      receivedAt: '2026-05-17T09:26:16Z',
    },
  ],
};
function app(type: 'jwt' | 'eventBasic' | null = 'jwt') {
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    if (type) c.set('authContext', { isAuthenticated: true, type, userId: 1, eventId: 'race' });
    await next();
  });
  return app.route('/', router);
}
const request = (value: unknown = body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

describe('punch REST adapter', () => {
  beforeEach(() => vi.mocked(ingestPunches).mockReset());
  it('requires a user JWT, including when event Basic auth is valid', async () => {
    for (const type of [null, 'eventBasic'] as const) {
      expect((await app(type).request('/race/punches', request())).status).toBe(401);
    }
    expect(ingestPunches).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and schema violations before calling the service', async () => {
    expect((await app().request('/race/punches', { ...request(), body: '{' })).status).toBe(400);
    expect((await app().request('/race/punches', request({ ...body, punches: [] }))).status).toBe(
      422,
    );
    expect(ingestPunches).not.toHaveBeenCalled();
  });
  it('preserves the results.data response and service ordering', async () => {
    const results = [
      { clientPunchId: body.punches[0].clientPunchId, status: 'STORED' as const, competitorId: 12 },
    ];
    vi.mocked(ingestPunches).mockResolvedValue(results);
    const response = await app().request('/race/punches', request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ results: { data: results }, error: false });
  });
  it('returns authorization and retry conflict errors in existing envelopes', async () => {
    for (const status of [401, 403, 404]) {
      vi.mocked(ingestPunches).mockRejectedValueOnce(new AuthzError('Denied', status));
      expect((await app().request('/race/punches', request())).status).toBe(status);
    }
    vi.mocked(ingestPunches).mockRejectedValueOnce(new PunchConflictError('Payload changed'));
    const response = await app().request('/race/punches', request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: true, code: 409 });
  });
});
