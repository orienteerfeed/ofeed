import { describe, expect, it, vi } from 'vitest';
import { eventEntryTimelineSchema } from '@repo/shared';
import { getEventEntryTimeline } from '../entry-insight.service.js';

const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const db = (
  items: Array<{ createdAt: Date; classId: number; class: { name: string } }> = [],
  owner: number | null = 7,
) => ({
  event: {
    findUnique: vi.fn().mockResolvedValue(owner === null ? null : { authorId: owner }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({
      timezone: 'Europe/Prague',
      date: new Date('2026-04-18T22:00:00Z'),
      entriesOpenAt: new Date('2026-03-01T08:00:00Z'),
      entriesCloseAt: new Date('2026-04-12T21:59:59Z'),
    }),
  },
  user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
  entryItem: { findMany: vi.fn().mockResolvedValue(items) },
});
const item = (createdAt: string, classId = 1) => ({
  createdAt: new Date(createdAt),
  classId,
  class: { name: `H${classId}` },
});

describe('event entry timeline insight', () => {
  it('requires JWT and event ownership before reading entries', async () => {
    const anonymous = db();
    await expect(
      getEventEntryTimeline(anonymous as never, { isAuthenticated: false }, 'race'),
    ).rejects.toMatchObject({ statusCode: 401 });
    const stranger = db([], 99);
    await expect(getEventEntryTimeline(stranger as never, auth, 'race')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(stranger.entryItem.findMany).not.toHaveBeenCalled();
  });

  it('counts new entries of valid orders per local day and class, flagging late ones', async () => {
    const prisma = db([
      // 23:30 UTC on 28 March is already 29 March in Prague (UTC+1).
      item('2026-03-28T23:30:00Z'),
      // After the DST switch Prague is UTC+2: 22:30 UTC is 00:30 on 30 March.
      item('2026-03-29T22:30:00Z'),
      item('2026-03-29T21:30:00Z', 2),
      item('2026-04-12T21:59:59Z'),
      item('2026-04-12T22:00:00Z'),
    ]);

    const timeline = await getEventEntryTimeline(prisma as never, auth, 'race');

    expect(eventEntryTimelineSchema.parse(timeline)).toEqual({
      timezone: 'Europe/Prague',
      entriesOpenOn: '2026-03-01',
      entriesCloseOn: '2026-04-12',
      eventOn: '2026-04-19',
      days: [
        { date: '2026-03-29', classId: 1, className: 'H1', entries: 1, lateEntries: 0 },
        { date: '2026-03-29', classId: 2, className: 'H2', entries: 1, lateEntries: 0 },
        { date: '2026-03-30', classId: 1, className: 'H1', entries: 1, lateEntries: 0 },
        { date: '2026-04-12', classId: 1, className: 'H1', entries: 1, lateEntries: 0 },
        { date: '2026-04-13', classId: 1, className: 'H1', entries: 1, lateEntries: 1 },
      ],
    });
    expect(prisma.entryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actionKey: 'NEW_ENTRY',
          entry: { eventId: 'race', status: { notIn: ['CANCELLED', 'REJECTED'] } },
        },
      }),
    );
  });
});
