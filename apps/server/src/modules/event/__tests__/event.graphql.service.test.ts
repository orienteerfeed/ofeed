import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  event: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

import { findEventsConnection, searchPublishedEvents } from '../event.service.js';

const prisma = prismaMock as never;

describe('event GraphQL service searchPublishedEvents', () => {
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

      return Promise.resolve([
        { id: 'private-event', name: 'Private test event', published: false },
      ]);
    });

    await expect(searchPublishedEvents(prisma, 'Test')).resolves.toEqual([
      { id: 'public-event', name: 'Test event', published: true },
    ]);
  });
});

describe('event GraphQL service findEventsConnection()', () => {
  const makeEvents = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      name: `Event ${i}`,
      date: new Date(Date.now() + i * 86_400_000),
      sport: { id: 1, name: 'Orienteering' },
      country: null,
      classes: [],
    }));

  beforeEach(() => {
    prismaMock.event.findMany.mockReset();
    prismaMock.event.findMany.mockResolvedValue([]);
  });

  it('RECENT filter uses descending date order', async () => {
    await findEventsConnection(prisma, { filter: 'RECENT' });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('ALL filter uses descending date order', async () => {
    await findEventsConnection(prisma, { filter: 'ALL' });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('UPCOMING filter uses ascending date order', async () => {
    await findEventsConnection(prisma, { filter: 'UPCOMING' });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'asc' }, { id: 'asc' }]);
  });

  it('TODAY filter uses ascending date order and restricts to today', async () => {
    await findEventsConnection(prisma, { filter: 'TODAY' });
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual([{ date: 'asc' }, { id: 'asc' }]);
    expect(arg.where.date).toHaveProperty('gte');
    expect(arg.where.date).toHaveProperty('lte');
  });

  it('returns hasNextPage true and trims extra event when more results exist', async () => {
    prismaMock.event.findMany.mockResolvedValue(makeEvents(13));
    const result = await findEventsConnection(prisma, { first: 12 });
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.edges).toHaveLength(12);
  });

  it('returns hasNextPage false when results fit in one page', async () => {
    prismaMock.event.findMany.mockResolvedValue(makeEvents(5));
    const result = await findEventsConnection(prisma, { first: 12 });
    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.edges).toHaveLength(5);
  });

  it('only returns published events through the where clause', async () => {
    await findEventsConnection(prisma, {});
    const arg = prismaMock.event.findMany.mock.calls[0][0];
    expect(arg.where.published).toBe(true);
  });
});
