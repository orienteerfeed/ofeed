import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import app from '../../../app.js';
import env from '../../../config/env.js';
import { MAP_TILE_SESSION_COOKIE } from '../map.session.js';

const MAP_TILE_URL = 'http://localhost/rest/v1/maps/tiles/raster/outdoor/256/9/277/172';
const MAP_TILE_SESSION_URL = 'http://localhost/rest/v1/maps/tiles/session';

describe('map tile protection', () => {
  const originalEnv = {
    MAPY_API_KEY: env.MAPY_API_KEY,
    MAP_TILE_COOKIE_SECRET: env.MAP_TILE_COOKIE_SECRET,
    MAP_TILE_SESSION_REQUIRED: env.MAP_TILE_SESSION_REQUIRED,
    MAP_TILE_SESSION_TTL_SECONDS: env.MAP_TILE_SESSION_TTL_SECONDS,
    NODE_ENV: env.NODE_ENV,
  };

  beforeEach(() => {
    env.MAPY_API_KEY = 'test-mapy-key';
    env.MAP_TILE_COOKIE_SECRET = 'test-map-tile-cookie-secret';
    env.MAP_TILE_SESSION_REQUIRED = true;
    env.MAP_TILE_SESSION_TTL_SECONDS = 900;
    env.NODE_ENV = 'production';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    env.MAPY_API_KEY = originalEnv.MAPY_API_KEY;
    env.MAP_TILE_COOKIE_SECRET = originalEnv.MAP_TILE_COOKIE_SECRET;
    env.MAP_TILE_SESSION_REQUIRED = originalEnv.MAP_TILE_SESSION_REQUIRED;
    env.MAP_TILE_SESSION_TTL_SECONDS = originalEnv.MAP_TILE_SESSION_TTL_SECONDS;
    env.NODE_ENV = originalEnv.NODE_ENV;
    vi.restoreAllMocks();
  });

  it('issues a short-lived tile session cookie', async () => {
    const response = await app.request(MAP_TILE_SESSION_URL, {
      method: 'POST',
    });

    expect(response.status).toBe(204);

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(`${MAP_TILE_SESSION_COOKIE.name}=`);
    expect(setCookie).toContain(`Path=${MAP_TILE_SESSION_COOKIE.path}`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain(`Max-Age=${env.MAP_TILE_SESSION_TTL_SECONDS}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects tile proxy requests without a valid session cookie when protection is enabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await app.request(MAP_TILE_URL);

    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('allows tile proxy requests with a valid session cookie when protection is enabled', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('tile-binary', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=600',
          'Content-Length': '11',
        },
      }),
    );

    const sessionResponse = await app.request(MAP_TILE_SESSION_URL, {
      method: 'POST',
    });
    const cookieHeader = sessionResponse.headers.get('set-cookie')?.split(';')[0];

    expect(cookieHeader).toBeTruthy();

    const response = await app.request(MAP_TILE_URL, {
      headers: {
        cookie: cookieHeader ?? '',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(await response.text()).toBe('tile-binary');
  });

  it('keeps tile responses embeddable in relaxed mode for local development', async () => {
    env.MAP_TILE_SESSION_REQUIRED = false;
    env.NODE_ENV = 'development';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('tile-binary', {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=600',
        },
      }),
    );

    const response = await app.request(MAP_TILE_URL);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=600');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });
});
