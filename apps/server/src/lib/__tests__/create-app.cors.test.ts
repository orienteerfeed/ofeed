import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import env from '../../config/env.js';
import createApp from '../create-app.js';
import restRoutes from '../../routes/rest/index.js';

describe('createApp CORS defaults', () => {
  const originalCorsMethods = env.CORS_METHODS;

  beforeEach(() => {
    env.CORS_METHODS = 'GET,HEAD,POST,PUT,DELETE,OPTIONS';
  });

  afterEach(() => {
    env.CORS_METHODS = originalCorsMethods;
  });

  it('allows PATCH in preflight responses even when legacy env config omits it', async () => {
    const app = createApp();
    app.route('/', restRoutes);

    const response = await app.request('http://localhost/rest/v1/admin/system-messages/1', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type,authorization',
      },
    });

    expect(response.ok).toBe(true);
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
  });
});
