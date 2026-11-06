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
      name: 'Race',
      location: 'Test',
      timezone: 'Europe/Prague',
      date: new Date('2026-04-18T22:00:00Z'),
      entriesOpenAt: new Date('2026-03-01T08:00:00Z'),
      entriesCloseAt: new Date('2026-04-12T21:59:59Z'),
    }),
  },
  user: { findUnique: vi.fn().mockResolvedValue({ role: 'USER' }) },
  entry: {
    findMany: vi.fn().mockResolvedValue(
      items.map((item, index) => ({
        id: `order-${index}`,
        createdAt: item.createdAt,
        status: 'RECEIVED',
        paid: false,
        paymentReference: String(index),
        paymentMethod: 'CASH',
        currency: 'CZK',
        totalAmount: { toNumber: () => 100 },
        promoCode: null,
        promoDiscountAmount: null,
        payments: [],
        items: [
          {
            ...item,
            id: index + 1,
            firstname: 'Test',
            lastname: 'Runner',
            organisation: null,
            card: 123,
            cardRental: false,
            fee: { toNumber: () => 100 },
            cardRentalFee: null,
            allowPromoCode: true,
          },
        ],
      })),
    ),
  },
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
    expect(stranger.entry.findMany).not.toHaveBeenCalled();
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

    expect(eventEntryTimelineSchema.parse(timeline)).toMatchObject({
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
    expect(prisma.entry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'race',
          items: { some: { actionKey: 'NEW_ENTRY' } },
        },
      }),
    );
  });
});

it('reports actual receipts, partial balances and legacy flags without fabricating money', async () => {
  const prisma = db([item('2026-03-28T12:00:00Z')]);
  const base = (await prisma.entry.findMany())[0]!;
  prisma.entry.findMany.mockResolvedValue([
    {
      ...base,
      id: 'partial',
      totalAmount: { toNumber: () => 100 },
      payments: [{ amount: { toNumber: () => 40 }, currency: 'CZK' }],
    },
    { ...base, id: 'legacy', paid: true },
    { ...base, id: 'cancelled', status: 'CANCELLED' },
    { ...base, id: 'overpaid', payments: [{ amount: { toNumber: () => 150 }, currency: 'CZK' }] },
  ] as never);
  const report = await getEventEntryTimeline(prisma as never, auth, 'race');
  expect(report.orders).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'partial',
        receivedAmount: 40,
        outstandingAmount: 60,
        paid: false,
      }),
      expect.objectContaining({
        id: 'legacy',
        receivedAmount: 0,
        outstandingAmount: 0,
        legacyPaid: true,
        paid: true,
      }),
      expect.objectContaining({
        id: 'overpaid',
        receivedAmount: 150,
        outstandingAmount: 0,
        paid: true,
      }),
    ]),
  );
  expect(report.days.reduce((sum, day) => sum + day.entries, 0)).toBe(3);
  expect(report.orders).toHaveLength(4);
});

it('retains the original order date when an item was edited later', async () => {
  const prisma = db([item('2026-03-01T12:00:00Z')]);
  const base = (await prisma.entry.findMany())[0]!;
  prisma.entry.findMany.mockResolvedValue([
    { ...base, items: [{ ...base.items[0]!, createdAt: new Date('2026-11-03T12:00:00Z') }] },
  ]);
  const report = await getEventEntryTimeline(prisma as never, auth, 'race');
  expect(report.days[0]!.date).toBe('2026-03-01');
  expect(report.orders![0]!.receivedAt).toBe('2026-03-01T12:00:00.000Z');
});
