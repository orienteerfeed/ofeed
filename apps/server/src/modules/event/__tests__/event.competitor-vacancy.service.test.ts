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
    },
    split: { deleteMany: vi.fn(), createMany: vi.fn() },
    protocol: { createMany: vi.fn() },
    startSlotVacancy: { deleteMany: vi.fn() },
    organisation: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  return mock;
});

const subscriptionMocks = vi.hoisted(() => ({
  publishUpdatedCompetitor: vi.fn(),
  publishUpdatedCompetitors: vi.fn(),
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
      event: { defaultStartMode: 'StartList' },
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
      class: { eventId: 'event-1', startMode: 'FreeStart', event: { defaultStartMode: 'StartList' } },
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
