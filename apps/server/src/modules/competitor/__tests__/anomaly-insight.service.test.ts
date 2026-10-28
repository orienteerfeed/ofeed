import { describe, expect, it, vi } from 'vitest';
import { getEventAnomalyInsight } from '../anomaly-insight.service.js';
import { category, competitor, event } from './anomaly-fixtures.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const db = (owner: number | null = 7, role = 'USER') => ({
  event: {
    findUnique: vi.fn().mockResolvedValue(owner === null ? null : { authorId: owner }),
    findUniqueOrThrow: vi.fn().mockResolvedValue(event),
  },
  user: { findUnique: vi.fn().mockResolvedValue({ role }) },
  class: { findMany: vi.fn().mockResolvedValue([]) },
});
describe('event anomaly insight service', () => {
  it('authorizes JWT owner/admin before reading classes or timing data', async () => {
    for (const actor of [
      { isAuthenticated: false },
      { isAuthenticated: true, type: 'eventBasic' as const, userId: 7 },
    ]) {
      const prisma = db();
      await expect(getEventAnomalyInsight(prisma as never, actor, 'race')).rejects.toMatchObject({
        statusCode: 401,
      });
      expect(prisma.class.findMany).not.toHaveBeenCalled();
      expect(prisma.event.findUniqueOrThrow).not.toHaveBeenCalled();
    }
    for (const [owner, statusCode] of [
      [99, 403],
      [null, 404],
    ] as const) {
      const prisma = db(owner);
      await expect(getEventAnomalyInsight(prisma as never, auth, 'race')).rejects.toMatchObject({
        statusCode,
      });
      expect(prisma.class.findMany).not.toHaveBeenCalled();
      expect(prisma.event.findUniqueOrThrow).not.toHaveBeenCalled();
    }
  });
  it.each([
    [7, 'USER'],
    [99, 'ADMIN'],
  ] as const)(
    'allows owner or admin (%s, %s) and scopes every read to the event',
    async (owner, role) => {
      const prisma = db(owner, role);
      expect(await getEventAnomalyInsight(prisma as never, auth, 'race')).toEqual({
        competitors: [],
        coverage: [],
      });
      expect(prisma.class.findMany).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          where: { eventId: 'race' },
          select: expect.objectContaining({
            competitors: {
              select: expect.objectContaining({
                punches: {
                  where: { eventId: 'race', controlCode: 0, superseded: false },
                  select: { punchTime: true },
                  orderBy: { punchTime: 'asc' },
                },
              }),
            },
          }),
        }),
      );
      expect(prisma.event.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'race' },
        select: { defaultStartMode: true, eventFormat: true },
      });
    },
  );
  it('enriches findings and coverage from the batched class read', async () => {
    const prisma = db();
    prisma.class.findMany.mockResolvedValue([
      category({
        competitors: [
          competitor(3, {
            punches: [{ punchTime: new Date('2026-10-28T10:00:00Z') }],
            organisation: { name: 'Club' },
          }),
        ],
      }),
    ] as never);
    const report = await getEventAnomalyInsight(prisma as never, auth, 'race');
    expect(report.competitors[0]).toMatchObject({
      id: 3,
      classId: 1,
      className: 'H21',
      organisation: 'Club',
      findings: [{ type: 'START_PUNCH' }],
    });
    expect(report.coverage).toHaveLength(3);
  });
});
