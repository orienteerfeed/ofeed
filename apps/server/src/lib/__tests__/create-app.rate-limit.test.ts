import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/context.js', () => ({
  default: {
    user: { findFirst: async ({ where }: { where: { id: number } }) => ({ id: where.id }) },
    event: {
      findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, authorId: 7 }),
    },
    eventPassword: { findUnique: vi.fn() },
  },
}));

import env from '../../config/env.js';
import prisma from '../../utils/context.js';
import { encodeBase64, encrypt } from '../crypto/encryption.js';
import { signAccessToken } from '../../modules/auth/access-token.js';
import { parseMultipartPayload } from '../http/body-parser.js';
import createApp from '../create-app.js';

const originalLimits = {
  RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX: env.RATE_LIMIT_MAX,
  GRAPHQL_RATE_LIMIT_MAX: env.GRAPHQL_RATE_LIMIT_MAX,
  UPLOAD_RATE_LIMIT_MAX: env.UPLOAD_RATE_LIMIT_MAX,
  SESSION_RATE_LIMIT_MAX: env.SESSION_RATE_LIMIT_MAX,
};
beforeEach(() => {
  Object.assign(env, {
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX: 600,
    GRAPHQL_RATE_LIMIT_MAX: 600,
    UPLOAD_RATE_LIMIT_MAX: 60,
    SESSION_RATE_LIMIT_MAX: 120,
  });
  vi.mocked(prisma.eventPassword.findUnique).mockResolvedValue({
    password: encodeBase64(encrypt('test-event-password')),
    expiresAt: new Date(Date.now() + 3_600_000),
  } as Awaited<ReturnType<typeof prisma.eventPassword.findUnique>>);
});
afterEach(() => {
  Object.assign(env, originalLimits);
  vi.useRealTimers();
});

const jwt = (userId = 7) => 'Bearer ' + signAccessToken(userId, randomUUID());
const basic = (eventId: string) =>
  'Basic ' + Buffer.from(eventId + ':test-event-password').toString('base64');
const origin = 'http://localhost:3000';
const paths = {
  graphql: '/graphql',
  rest: '/rest/v1/events/work',
  upload: '/rest/v1/upload/iof',
  image: '/rest/v1/events/test/image',
  refresh: '/rest/v1/auth/refresh',
  logout: '/rest/v1/auth/logout',
  signin: '/rest/v1/auth/signin',
};
function fixture() {
  const app = createApp();
  // Real authentication and rate-limit middleware; only DB lookups/terminal handlers are fixtures.
  for (const path of [paths.graphql, paths.rest, paths.refresh, paths.logout, paths.signin])
    app.post(path, (c) => c.json({ ok: true }));
  const upload = async (c: Parameters<typeof parseMultipartPayload>[0]) => {
    const { file } = await parseMultipartPayload(c);
    return Response.json({ size: file?.size });
  };
  app.post(paths.upload, upload);
  app.post(paths.image, upload);
  app.get(paths.image, (c) => c.text('image'));
  return (path: string, authorization?: string, init?: RequestInit, ip = '192.0.2.10') => {
    const headers = new Headers(init?.headers);
    headers.set('Origin', origin);
    headers.set('X-Forwarded-For', ip);
    if (authorization) headers.set('Authorization', authorization);
    return app.request('http://localhost' + path, { method: 'POST', ...init, headers });
  };
}
function multipart(size = 128) {
  const body = new FormData();
  body.append('eventId', 'test');
  body.append('file', new File(['x'.repeat(size)], 'results.xml', { type: 'application/xml' }));
  return body;
}

describe('API rate-limit headroom', () => {
  it('admits the full anonymous GraphQL budget without consuming a signed-in user budget', async () => {
    const request = fixture();
    const responses = await Promise.all(Array.from({ length: 600 }, () => request(paths.graphql)));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(
      Math.min(...responses.map((response) => Number(response.headers.get('ratelimit-remaining')))),
    ).toBe(0);
    expect((await request(paths.graphql)).status).toBe(429);
    expect((await request(paths.graphql, jwt())).status).toBe(200);
  });

  it('accepts concurrent three-tab work, polling and uploads for three users on one IP', async () => {
    const request = fixture();
    const before = Date.now();
    await Promise.all(
      [jwt(7), jwt(8), jwt(9)].map(async (authorization) => {
        const [graphql, rest, uploads, refresh] = await Promise.all([
          Promise.all(Array.from({ length: 240 }, () => request(paths.graphql, authorization))),
          Promise.all(Array.from({ length: 120 }, () => request(paths.rest, authorization))),
          Promise.all(
            Array.from({ length: 12 }, () =>
              request(paths.upload, authorization, { body: multipart() }),
            ),
          ),
          Promise.all(Array.from({ length: 6 }, () => request(paths.refresh, authorization))),
        ]);
        for (const response of [...graphql, ...rest, ...uploads, ...refresh])
          expect(response.status).toBe(200);
        for (const response of uploads) expect(await response.json()).toMatchObject({ size: 128 });
        expect(
          Math.min(
            ...uploads.map((response) => Number(response.headers.get('ratelimit-remaining'))),
          ),
        ).toBe(48);
        for (const [path, limit, remaining] of [
          [paths.graphql, 600, 359],
          [paths.rest, 600, 479],
        ] as const) {
          const response = await request(path, authorization);
          expect(response.headers.get('ratelimit-limit')).toBe(String(limit));
          expect(response.headers.get('ratelimit-remaining')).toBe(String(remaining));
        }
      }),
    );
    expect(Date.now() - before).toBeLessThan(60_000);
  });

  it('keeps uploads, REST and sessions usable after exhausting GraphQL and exposes recovery headers', async () => {
    env.GRAPHQL_RATE_LIMIT_MAX = 3;
    const request = fixture();
    const authorization = jwt();
    for (let index = 0; index < 3; index++)
      expect((await request(paths.graphql, authorization)).status).toBe(200);
    const response = await request(paths.graphql + '/', authorization);
    expect(response.status).toBe(429);
    expect(response.headers.get('ratelimit-remaining')).toBe('0');
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    for (const header of [
      'Retry-After',
      'RateLimit-Limit',
      'RateLimit-Remaining',
      'RateLimit-Reset',
    ])
      expect(response.headers.get('access-control-expose-headers')).toContain(header);
    expect((await request(paths.upload, authorization, { body: multipart() })).status).toBe(200);
    for (const path of [paths.rest, paths.refresh, paths.logout])
      expect((await request(path, authorization)).status).toBe(200);
  });

  it('shares user quota across tokens/IPs, isolates users and refuses forged device/token identities', async () => {
    env.GRAPHQL_RATE_LIMIT_MAX = 2;
    const request = fixture();
    expect((await request(paths.graphql, jwt(7))).status).toBe(200);
    expect((await request(paths.graphql, jwt(7), undefined, '192.0.2.11')).status).toBe(200);
    expect((await request(paths.graphql, jwt(7))).status).toBe(429);
    expect((await request(paths.graphql, jwt(8))).status).toBe(200);
    expect((await request(paths.graphql)).status).toBe(200);
    expect(
      (
        await request(paths.graphql, 'Bearer invalid-one', {
          headers: { 'X-Device-Id': randomUUID() },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(paths.graphql, 'Bearer invalid-two', {
          headers: { 'X-Device-Id': randomUUID() },
        })
      ).status,
    ).toBe(429);
    expect((await request(paths.graphql, undefined, undefined, '192.0.2.12')).status).toBe(200);
  });

  it('isolates verified event Basic budgets and counts invalid event credentials as anonymous', async () => {
    env.UPLOAD_RATE_LIMIT_MAX = 1;
    const request = fixture();
    expect((await request(paths.upload, basic('event-one'), { body: multipart() })).status).toBe(
      200,
    );
    expect((await request(paths.upload, basic('event-one'), { body: multipart() })).status).toBe(
      429,
    );
    expect((await request(paths.upload, basic('event-two'), { body: multipart() })).status).toBe(
      200,
    );
    const invalid = 'Basic ' + Buffer.from('event-three:wrong-password').toString('base64');
    expect((await request(paths.upload, invalid, { body: multipart() })).status).toBe(200);
    expect((await request(paths.upload, undefined, { body: multipart() })).status).toBe(429);
  });

  it('reserves upload quota for imports/image writes and retains body limits', async () => {
    env.RATE_LIMIT_MAX = 1;
    env.UPLOAD_RATE_LIMIT_MAX = 2;
    const request = fixture();
    const authorization = jwt();
    expect((await request(paths.rest, authorization)).status).toBe(200);
    expect((await request(paths.rest, authorization)).status).toBe(429);
    const upload = await request(paths.upload, authorization, { body: multipart(1024 * 1024 + 1) });
    expect(upload.status).toBe(200);
    expect(await upload.json()).toMatchObject({ size: 1024 * 1024 + 1 });
    expect((await request(paths.image, authorization, { body: multipart() })).status).toBe(200);
    expect((await request(paths.upload, authorization, { body: multipart() })).status).toBe(429);
    expect((await request(paths.image, authorization, { method: 'GET' })).status).toBe(429);
    expect(
      (await request(paths.upload, jwt(8), { body: multipart(env.MAX_UPLOAD_BODY_SIZE_BYTES + 1) }))
        .status,
    ).toBe(413);
  });

  it('keeps credential and refresh/logout quotas independent and enforces configured limits', async () => {
    env.SESSION_RATE_LIMIT_MAX = 12;
    const request = fixture();
    for (let index = 0; index < 10; index++) expect((await request(paths.signin)).status).toBe(200);
    expect((await request(paths.signin)).status).toBe(429);
    for (let index = 0; index < 12; index++)
      expect((await request(index % 2 ? paths.refresh + '/' : paths.logout)).status).toBe(200);
    expect((await request(paths.refresh, jwt(8))).status).toBe(429);
    expect((await request(paths.signin, jwt(8))).status).toBe(429);
    expect((await request(paths.graphql, jwt(7))).status).toBe(200);
  });

  it('does not count CORS preflight and restores quota after one minute', async () => {
    vi.useFakeTimers();
    env.GRAPHQL_RATE_LIMIT_MAX = 1;
    const request = fixture();
    for (let index = 0; index < 3; index++) {
      const response = await request(paths.graphql, undefined, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      });
      expect(response.status).toBe(204);
    }
    expect((await request(paths.graphql)).status).toBe(200);
    expect((await request(paths.graphql)).status).toBe(429);
    await vi.advanceTimersByTimeAsync(60_001);
    expect((await request(paths.graphql)).status).toBe(200);
  });
});
