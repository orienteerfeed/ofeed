import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock prisma so storeCompetitor / updateCompetitor never touch a real DB.
// `$transaction(cb)` runs the callback synchronously against the same mock,
// emulating an interactive transaction where `tx === prisma`.
const prismaMock = vi.hoisted(() => {
  const mock: Record<string, unknown> = {
    class: { findUnique: vi.fn() },
    competitor: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    split: { deleteMany: vi.fn(), createMany: vi.fn() },
    protocol: { createMany: vi.fn() },
    startSlotVacancy: { deleteMany: vi.fn(), createMany: vi.fn() },
    entryItem: { findFirst: vi.fn() },
    organisation: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    punch: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return mock;
});

const subscriptionMocks = vi.hoisted(() => ({
  publishUpdatedCompetitor: vi.fn().mockResolvedValue(undefined),
  publishUpdatedCompetitors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../utils/context.js', () => ({ default: prismaMock }));
vi.mock('../../../utils/subscriptionUtils.js', () => subscriptionMocks);

import { storeCompetitor, updateCompetitor } from '../event.service.js';

const START_TIME = new Date('2026-06-01T09:30:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  // Interactive-transaction callbacks run against the same mock client.
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: unknown) => unknown)(prismaMock);
    }
    // Array form: resolve each operation (none of these tests rely on it).
    return Promise.all(arg as Promise<unknown>[]);
  });
  (
    prismaMock.competitor as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
  ).findUniqueOrThrow.mockImplementation((...args) =>
    (prismaMock.competitor as { findUnique: (...args: unknown[]) => Promise<unknown> }).findUnique(
      ...args,
    ),
  );
  (prismaMock.protocol as { createMany: ReturnType<typeof vi.fn> }).createMany.mockResolvedValue({
    count: 1,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('storeCompetitor start slot vacancy cleanup', () => {
  beforeEach(() => {
    (prismaMock.class as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({
      id: 42,
      eventId: 'event-1',
      startMode: 'FreeStart',
      maxNumberOfCompetitors: 100,
      event: { defaultStartMode: 'StartList', date: new Date('2026-07-10T14:30:00.000Z') },
      _count: { competitors: 0, startSlotVacancies: 0 },
    });
  });

  it('deletes the matching vacancy after creating a competitor with a start time', async () => {
    const created = { id: 7, classId: 42, startTime: START_TIME };
    (prismaMock.competitor as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue(
      created,
    );
    (
      prismaMock.competitor as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue({
      id: 7,
      classId: 42,
      startTime: START_TIME,
      organisation: null,
      team: null,
    });

    await storeCompetitor(
      'event-1',
      {
        classId: 42,
        firstname: 'Jana',
        lastname: 'Nova',
        registration: 'ABC1234567',
        startTime: START_TIME,
      } as never,
      1,
      'START',
    );

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(
      (prismaMock.startSlotVacancy as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany,
    ).toHaveBeenCalledWith({ where: { classId: 42, startTime: START_TIME } });
  });

  it('uses the full event date-time for a free-start competitor without a selected start time', async () => {
    const created = { id: 9, classId: 42, startTime: new Date('2026-07-10T14:30:00.000Z') };
    (prismaMock.competitor as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue(
      created,
    );
    (
      prismaMock.competitor as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue({
      id: 9,
      classId: 42,
      startTime: created.startTime,
      organisation: null,
      team: null,
    });

    await storeCompetitor(
      'event-1',
      {
        classId: 42,
        firstname: 'Jana',
        lastname: 'Nova',
        registration: 'ABC1234567',
      } as never,
      1,
      'START',
    );

    expect(
      (prismaMock.competitor as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ startTime: created.startTime }),
      }),
    );
  });

  it('does not delete any vacancy when the competitor has no start time', async () => {
    const created = { id: 8, classId: 42, startTime: null };
    (prismaMock.competitor as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue(
      created,
    );
    (
      prismaMock.competitor as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue({
      id: 8,
      classId: 42,
      startTime: null,
      organisation: null,
      team: null,
    });

    await storeCompetitor(
      'event-1',
      {
        classId: 42,
        firstname: 'Jana',
        lastname: 'Nova',
        registration: 'ABC1234567',
      } as never,
      1,
      'START',
    );

    expect(
      (prismaMock.startSlotVacancy as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany,
    ).not.toHaveBeenCalled();
  });
});

describe('updateCompetitor start slot vacancy cleanup', () => {
  beforeEach(() => {
    (prismaMock.competitor as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
      id: 7,
      classId: 42,
      class: {
        eventId: 'event-1',
        startMode: 'FreeStart',
        event: { defaultStartMode: 'StartList' },
      },
      firstname: 'Jana',
      lastname: 'Nova',
      organisation: null,
      startTime: null,
      bibNumber: null,
      status: 'Inactive',
      splits: [],
    });
  });

  it('deletes the matching vacancy for the new class + start time after update', async () => {
    (prismaMock.competitor as { update: ReturnType<typeof vi.fn> }).update.mockResolvedValue({
      id: 7,
      classId: 42,
      startTime: START_TIME,
    });
    (
      prismaMock.competitor as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue({
      id: 7,
      classId: 42,
      startTime: START_TIME,
      organisation: null,
      team: null,
    });

    await updateCompetitor('event-1', 7, 'START', { startTime: START_TIME }, 1);

    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(
      (prismaMock.startSlotVacancy as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany,
    ).toHaveBeenCalledWith({ where: { classId: 42, startTime: START_TIME } });
  });

  it('does not delete any vacancy when the updated competitor has no start time', async () => {
    (prismaMock.competitor as { update: ReturnType<typeof vi.fn> }).update.mockResolvedValue({
      id: 7,
      classId: 42,
      startTime: null,
    });
    (
      prismaMock.competitor as { findUnique: ReturnType<typeof vi.fn> }
    ).findUnique.mockResolvedValue({
      id: 7,
      classId: 42,
      startTime: null,
      organisation: null,
      team: null,
    });

    await updateCompetitor('event-1', 7, 'START', { note: 'hello' }, 1);

    expect(
      (prismaMock.startSlotVacancy as { deleteMany: ReturnType<typeof vi.fn> }).deleteMany,
    ).not.toHaveBeenCalled();
  });
});

// Keep mutable rows between calls so a move away and back exercises real
// consume/restore transitions rather than independent mocked return values.
describe('competitor start-list moves', () => {
  const otherTime = new Date('2026-06-01T11:32:00Z');
  function setup() {
    let row = {
      id: 7,
      classId: 42,
      startTime: START_TIME,
      bibNumber: null,
      class: {
        eventId: 'event-1',
        startMode: 'StartList',
        event: { defaultStartMode: 'StartList' },
      },
      firstname: 'Jana',
      lastname: 'Nova',
      organisation: null,
      status: 'Inactive',
      splits: [],
      note: 'previous note',
    };
    const slots = new Map<string, Date>([[`42:${otherTime.getTime()}`, otherTime]]);
    const competitor = prismaMock.competitor as Record<string, ReturnType<typeof vi.fn>>;
    const vacancy = prismaMock.startSlotVacancy as Record<string, ReturnType<typeof vi.fn>>;
    competitor.findFirst.mockImplementation(async ({ where }) => {
      if (where.id) return { ...row };
      return where.classId === row.classId &&
        where.startTime?.getTime() === row.startTime?.getTime()
        ? { id: row.id }
        : null;
    });
    competitor.update.mockImplementation(async ({ data }) => (row = { ...row, ...data }));
    competitor.findUnique.mockImplementation(async () => ({ ...row, team: null }));
    vacancy.deleteMany.mockImplementation(async ({ where }) => ({
      count: slots.delete(`${where.classId}:${where.startTime.getTime()}`) ? 1 : 0,
    }));
    vacancy.createMany.mockImplementation(async ({ data }) => {
      for (const slot of data)
        slots.set(`${slot.classId}:${slot.startTime.getTime()}`, slot.startTime);
      return { count: data.length };
    });
    (prismaMock.entryItem as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue(
      null,
    );
    return { slots, competitor, vacancy };
  }

  it('moving away and back releases the old time once and consumes the current time', async () => {
    const { slots } = setup();
    await updateCompetitor('event-1', 7, 'OFFICE', { startTime: otherTime }, 1);
    expect([...slots.values()]).toEqual([START_TIME]);
    await updateCompetitor('event-1', 7, 'OFFICE', { startTime: START_TIME }, 1);
    expect([...slots.values()]).toEqual([otherTime]);
    await updateCompetitor('event-1', 7, 'OFFICE', { startTime: START_TIME }, 1);
    expect([...slots.values()]).toEqual([otherTime]);
  });

  it('rejects a time absent from the free-slot list without changing the competitor', async () => {
    const { competitor } = setup();
    await expect(
      updateCompetitor(
        'event-1',
        7,
        'OFFICE',
        {
          startTime: new Date('2026-06-01T12:00:00Z'),
        },
        1,
      ),
    ).rejects.toThrow('The requested start time is not available.');
    expect(competitor.update).not.toHaveBeenCalled();
  });

  it('rejects a slot reserved by a pending entry', async () => {
    const { competitor } = setup();
    (prismaMock.entryItem as Record<string, ReturnType<typeof vi.fn>>).findFirst.mockResolvedValue({
      id: 100,
    });
    await expect(
      updateCompetitor('event-1', 7, 'OFFICE', { startTime: otherTime }, 1),
    ).rejects.toThrow('The requested start time is not available.');
    expect(competitor.update).not.toHaveBeenCalled();
  });

  it('moves slots between classes when the timestamp is unchanged', async () => {
    const { slots } = setup();
    slots.set(`43:${START_TIME.getTime()}`, START_TIME);
    (prismaMock.class as Record<string, ReturnType<typeof vi.fn>>).findUnique.mockResolvedValue({
      startMode: 'StartList',
      event: { defaultStartMode: 'StartList' },
    });
    await updateCompetitor('event-1', 7, 'OFFICE', { classId: 43 }, 1);
    expect(slots.has(`43:${START_TIME.getTime()}`)).toBe(false);
    expect(slots.has(`42:${START_TIME.getTime()}`)).toBe(true);
  });

  it('clears an empty note to null and records the change', async () => {
    const { competitor } = setup();
    await updateCompetitor('event-1', 7, 'OFFICE', { note: '' }, 1);
    expect(competitor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { note: null } }),
    );
    expect(
      (prismaMock.protocol as Record<string, ReturnType<typeof vi.fn>>).createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: 'note_change',
          previousValue: 'previous note',
          newValue: 'null',
        }),
      ],
    });
  });
});
