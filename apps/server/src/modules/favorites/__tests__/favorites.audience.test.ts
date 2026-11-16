import { describe, expect, it, vi } from 'vitest';
import { favoriteAudience } from '../favorites.audience.js';

describe('favorite audience SQL boundary', () => {
  it('converts MariaDB UNION bigint IDs to exact application numbers', async () => {
    const db = {
      $queryRaw: vi
        .fn()
        .mockResolvedValue([{ competitorId: 4294967295n, userId: 7n, athleteFollowId: 'follow' }]),
    };
    expect(await favoriteAudience(db as never, 'event', { userId: 7 })).toEqual([
      { competitorId: 4294967295, userId: 7, athleteFollowId: 'follow' },
    ]);
  });
});
