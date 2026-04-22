import { describe, expect, it } from 'vitest';

import { getAuthorizationHeader } from '../server.js';

describe('graphql websocket authorization parsing', () => {
  it('reads top-level Authorization header from connection params', () => {
    expect(
      getAuthorizationHeader({
        Authorization: 'Bearer top-level-token',
      }),
    ).toBe('Bearer top-level-token');
  });

  it('reads nested headers.Authorization from connection params', () => {
    expect(
      getAuthorizationHeader({
        headers: {
          Authorization: 'Bearer nested-token',
        },
      }),
    ).toBe('Bearer nested-token');
  });

  it('returns undefined when no authorization is provided', () => {
    expect(getAuthorizationHeader({})).toBeUndefined();
    expect(getAuthorizationHeader(null)).toBeUndefined();
  });
});
