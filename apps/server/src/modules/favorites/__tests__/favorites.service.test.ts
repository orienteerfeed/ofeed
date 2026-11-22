import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  favoriteCompetitorIds,
  selectedEventCompetitors,
  setCompetitorFavorite,
} from '../favorites.service.js';
import { favoriteAudience } from '../favorites.audience.js';
vi.mock('../favorites.audience.js', () => ({
  favoriteAudience: vi
    .fn()
    .mockResolvedValue([{ competitorId: 1, userId: 7, athleteFollowId: null }]),
}));
const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const input = { eventId: 'event', competitorId: 1, favorite: true };
function database() {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 7, deletedAt: null }]),
    user: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
    event: {
      findFirst: vi.fn().mockResolvedValue({ id: 'event' }),
      findUnique: vi.fn().mockResolvedValue({ published: true, authorId: 8 }),
    },
    competitor: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 1, registration: '' }),
    },
    competitorFavorite: {
      findMany: vi.fn().mockResolvedValue([{ competitorId: 1 }]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation(async (operation) => operation(db));
  return db;
}
let db: ReturnType<typeof database>;
beforeEach(() => {
  db = database();
});
describe('account favorite selection', () => {
  it('returns only the authenticated user and event selection', async () => {
    expect(await favoriteCompetitorIds(db as never, auth, { eventId: 'event' })).toEqual([1]);
    expect(favoriteAudience).toHaveBeenCalledWith(db, 'event', { userId: 7, includePaused: true });
  });
  it.each([
    { isAuthenticated: false, type: null },
    { isAuthenticated: true, type: 'eventBasic', userId: 7 },
  ])('rejects a non-account identity %j', async (actor) => {
    await expect(setCompetitorFavorite(db as never, actor as never, input)).rejects.toThrow('JWT');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('validates event membership and rejects deleted recipients', async () => {
    db.competitor.findFirst.mockResolvedValue(null);
    await expect(setCompetitorFavorite(db as never, auth, input)).rejects.toThrow('unavailable');
    db.competitor.findFirst.mockResolvedValue({ id: 1, registration: '' });
    db.$queryRaw.mockResolvedValue([{ id: 7, deletedAt: new Date() }] as never);
    await expect(setCompetitorFavorite(db as never, auth, input)).rejects.toThrow('unavailable');
    expect(db.competitorFavorite.create).not.toHaveBeenCalled();
  });
  it('enforces the limit but allows idempotent adds and removals at that limit', async () => {
    db.competitorFavorite.count.mockResolvedValue(100);
    await expect(setCompetitorFavorite(db as never, auth, input)).rejects.toThrow('100');
    db.competitorFavorite.findUnique.mockResolvedValue({ userId: 7, competitorId: 1 } as never);
    await expect(setCompetitorFavorite(db as never, auth, input)).resolves.toBe(true);
    expect(db.competitorFavorite.create).not.toHaveBeenCalled();
    await expect(
      setCompetitorFavorite(db as never, auth, { ...input, favorite: false }),
    ).resolves.toBe(false);
    expect(db.competitorFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7, competitorId: 1 },
    });
  });
  it('allows bounded public selection without exposing other events', async () => {
    await selectedEventCompetitors(
      db as never,
      { isAuthenticated: false, type: null },
      { eventId: 'event', competitorIds: [1, 2] },
    );
    expect(db.competitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [1, 2] }, class: { eventId: 'event' } } }),
    );
    await expect(
      selectedEventCompetitors(db as never, auth, {
        eventId: 'event',
        competitorIds: Array.from({ length: 1001 }, (_, i) => i + 1),
      }),
    ).rejects.toThrow('Invalid');
  });
});
