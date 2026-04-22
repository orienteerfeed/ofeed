import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import eventRouter from '../event.routes.js';

describe('event routes (hono)', () => {
  function createAuthenticatedApp() {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set(
        'authContext' as never,
        {
          isAuthenticated: true,
          type: 'jwt',
          userId: 1,
        } as never,
      );
      await next();
    });
    app.route('/', eventRouter as any);
    return app;
  }

  it('returns 401 for /import/search without jwt auth context', async () => {
    const app = new Hono();
    app.route('/', eventRouter as any);

    const response = await app.request('http://localhost/import/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'ORIS',
        query: 'praha',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 401 for /import/preview without jwt auth context', async () => {
    const app = new Hono();
    app.route('/', eventRouter as any);

    const response = await app.request('http://localhost/import/preview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'ORIS',
        externalEventId: '8300',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 422 for /import/preview with invalid payload when authenticated', async () => {
    const app = createAuthenticatedApp();

    const response = await app.request('http://localhost/import/preview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'ORIS',
      }),
    });

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toHaveProperty('message', 'Validation errors');
    expect(payload).toHaveProperty('error', true);
  });

  it('returns 401 for /:eventId/import/sync-official-results without jwt auth context', async () => {
    const app = new Hono();
    app.route('/', eventRouter as any);

    const response = await app.request('http://localhost/event_123/import/sync-official-results', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(401);
  });
});
