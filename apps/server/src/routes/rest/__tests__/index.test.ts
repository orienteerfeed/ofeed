import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import env from '../../../config/env.js';
import meosRouter from '../../../modules/meos/index.js';
import uploadRouter from '../../../modules/upload/index.js';
import restRouter from '../index.js';
import { REST_ROUTE_REGISTRY } from '../registry.js';

describe('rest router registry', () => {
  const originalMapEnv = {
    MAPY_API_KEY: env.MAPY_API_KEY,
    MAP_TILE_SESSION_REQUIRED: env.MAP_TILE_SESSION_REQUIRED,
  };

  beforeEach(() => {
    env.MAPY_API_KEY = 'test-mapy-key';
    env.MAP_TILE_SESSION_REQUIRED = false;
  });

  afterEach(() => {
    env.MAPY_API_KEY = originalMapEnv.MAPY_API_KEY;
    env.MAP_TILE_SESSION_REQUIRED = originalMapEnv.MAP_TILE_SESSION_REQUIRED;
  });

  it('mounts auth module routes', async () => {
    const app = new Hono();
    app.route('/', restRouter as any);

    const response = await app.request('http://localhost/rest/v1/auth/signin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(422);
  });

  it('mounts map module routes under /rest/v1/maps', async () => {
    const app = new Hono();
    app.route('/', restRouter as any);

    const response = await app.request(
      'http://localhost/rest/v1/maps/tiles/raster/outdoor/512/9/277/172',
    );

    expect(response.status).toBe(422);
  });

  it('mounts admin module routes under /rest/v1/admin', async () => {
    const app = new Hono();
    app.route('/', restRouter as any);

    const response = await app.request('http://localhost/rest/v1/admin/dashboard');

    expect(response.status).toBe(401);
  });

  it('mounts the MeOS upload router before the authenticated upload router', () => {
    const meosIndex = REST_ROUTE_REGISTRY.findIndex((entry) => entry.router === meosRouter);
    const uploadIndex = REST_ROUTE_REGISTRY.findIndex((entry) => entry.router === uploadRouter);

    expect(meosIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(meosIndex).toBeLessThan(uploadIndex);
  });
});
