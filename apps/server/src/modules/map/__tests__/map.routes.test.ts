import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import env from '../../../config/env.js';
import mapRouter from '../map.routes.js';

describe('map routes (hono)', () => {
  const originalEnv = {
    MAPY_API_KEY: env.MAPY_API_KEY,
    MAP_TILE_SESSION_REQUIRED: env.MAP_TILE_SESSION_REQUIRED,
  };

  beforeEach(() => {
    env.MAPY_API_KEY = 'test-mapy-key';
    env.MAP_TILE_SESSION_REQUIRED = false;
  });

  afterEach(() => {
    env.MAPY_API_KEY = originalEnv.MAPY_API_KEY;
    env.MAP_TILE_SESSION_REQUIRED = originalEnv.MAP_TILE_SESSION_REQUIRED;
  });

  it('returns 422 for unsupported tile size on raster tile route', async () => {
    const app = new Hono();
    app.route('/', mapRouter as any);

    const response = await app.request('http://localhost/tiles/raster/outdoor/512/9/277/172');

    expect(response.status).toBe(422);
  });

  it('does not expose the legacy tile route shape', async () => {
    const app = new Hono();
    app.route('/', mapRouter as any);

    const response = await app.request('http://localhost/tiles/9/277/172');

    expect(response.status).toBe(404);
  });
});
