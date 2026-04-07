import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

import { searchEvents } from '../query.js';

describe('event GraphQL query searchEvents', () => {
  beforeEach(() => {
    prismaMock.$queryRaw.mockReset();
  });

  it('returns only published events from full-text search', async () => {
    prismaMock.$queryRaw.mockImplementation((strings: TemplateStringsArray, query: string) => {
      const sql = strings.join('__QUERY__');

      expect(query).toBe('Test');

      if (sql.includes('published = true')) {
        return Promise.resolve([{ id: 'public-event', name: 'Test event', published: true }]);
      }

      return Promise.resolve([{ id: 'private-event', name: 'Private test event', published: false }]);
    });

    await expect(searchEvents(null, { query: 'Test' })).resolves.toEqual([
      { id: 'public-event', name: 'Test event', published: true },
    ]);
  });
});
