import { describe, expect, it, vi } from 'vitest';
import { eventCardInsightSchema } from '@repo/shared';
import { getEventCardInsight } from '../card-insight.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const db = (owner: number | null = 7, role = 'USER') => ({
  event: { findUnique: vi.fn().mockResolvedValue(owner === null ? null : { authorId: owner }) },
  user: { findUnique: vi.fn().mockResolvedValue({ role }) },
  competitor: { findMany: vi.fn().mockResolvedValue([]) },
});
const row = (id: number, card: number | null, classId = 1) => ({
  id,
  card,
  classId,
  class: { name: `Class ${classId}` },
  organisation: null,
  firstname: 'Jan',
  lastname: 'Novak',
  registration: 'ABC1234',
  bibNumber: null,
});

describe('event card insight', () => {
  it('requires JWT and event ownership before reading competitor data', async () => {
    for (const actor of [
      { isAuthenticated: false },
      { isAuthenticated: true, type: 'eventBasic' as const },
    ]) {
      const prisma = db();
      await expect(getEventCardInsight(prisma as never, actor, 'race')).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(prisma.competitor.findMany).not.toHaveBeenCalled();
    }
    for (const [owner, statusCode] of [
      [99, 403],
      [null, 404],
    ] as const) {
      const prisma = db(owner);
      await expect(getEventCardInsight(prisma as never, auth, 'race')).rejects.toMatchObject({
        statusCode,
      });
      expect(prisma.competitor.findMany).not.toHaveBeenCalled();
    }
  });
  it('allows administrators and scopes the complete read to one event without status restrictions', async () => {
    const prisma = db(99, 'ADMIN');
    expect(await getEventCardInsight(prisma as never, auth, 'race')).toEqual({
      missingCards: [],
      duplicateCards: [],
    });
    expect(prisma.competitor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { class: { eventId: 'race' } },
        orderBy: [
          { class: { name: 'asc' } },
          { lastname: 'asc' },
          { firstname: 'asc' },
          { id: 'asc' },
        ],
      }),
    );
  });
  it('separates NULL and zero from positive duplicates across classes and excludes unique cards', async () => {
    const prisma = db();
    prisma.competitor.findMany.mockResolvedValue([
      row(1, null),
      row(2, 0),
      row(3, 0),
      row(4, 900),
      row(5, 900, 2),
      row(6, 900, 3),
      row(7, 12),
      row(8, 12),
      row(9, 321),
    ] as never);
    const result = await getEventCardInsight(prisma as never, auth, 'race');
    expect(result.missingCards.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(
      result.duplicateCards.map((group) => [group.card, group.competitors.map((item) => item.id)]),
    ).toEqual([
      [12, [7, 8]],
      [900, [4, 5, 6]],
    ]);
    expect(result.duplicateCards[1]?.competitors[1]).toMatchObject({
      classId: 2,
      className: 'Class 2',
      organisation: null,
    });
    expect(eventCardInsightSchema.safeParse(result).success).toBe(true);
    expect(prisma.competitor.findMany).toHaveBeenCalledOnce();
  });
});
