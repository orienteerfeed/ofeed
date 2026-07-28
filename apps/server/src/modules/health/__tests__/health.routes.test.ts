import { describe, expect, it } from 'vitest';

import app from '../../../app.js';

describe('health probe routes', () => {
  it('returns liveness without checking external dependencies', async () => {
    const response = await app.request('/healthz');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({ status: 'alive' });
  });

  it.each(['/health', '/health/live', '/health/ready'])(
    'does not expose legacy probe %s',
    async (path) => {
      const response = await app.request(path);

      expect(response.status).toBe(404);
    },
  );
});
