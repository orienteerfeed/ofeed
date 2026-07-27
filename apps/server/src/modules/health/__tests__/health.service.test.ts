import { describe, expect, it } from 'vitest';

import { isReady } from '../health.service.js';

describe('health.service', () => {
  it('is ready only when database is UP', () => {
    expect(isReady([{ name: 'database', status: 'UP' }] as any)).toBe(true);
    expect(isReady([{ name: 'database', status: 'DOWN' }] as any)).toBe(false);
  });
});
