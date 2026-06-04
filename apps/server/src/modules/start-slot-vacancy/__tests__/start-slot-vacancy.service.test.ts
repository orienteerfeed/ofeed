import { describe, expect, it, vi } from 'vitest';

import {
  bulkCreateStartSlotVacancies,
  createStartSlotVacancy,
  deleteMatchingStartSlotVacancy,
  deleteStartSlotVacancy,
  listEventStartSlotVacanciesGroupedByClass,
  listStartSlotVacanciesByClass,
} from '../start-slot-vacancy.service.js';

describe('createStartSlotVacancy', () => {
  it('creates a vacancy for the given class and start time', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const created = { id: 1, classId: 42, startTime, bibNumber: null };
    const prisma = {
      startSlotVacancy: { create: vi.fn().mockResolvedValue(created) },
    };

    await expect(
      createStartSlotVacancy(prisma as never, { classId: 42, startTime }),
    ).resolves.toEqual(created);

    expect(prisma.startSlotVacancy.create).toHaveBeenCalledWith({
      data: { classId: 42, startTime, bibNumber: null },
    });
  });

  it('stores bibNumber when provided', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const created = { id: 2, classId: 42, startTime, bibNumber: 101 };
    const prisma = {
      startSlotVacancy: { create: vi.fn().mockResolvedValue(created) },
    };

    await expect(
      createStartSlotVacancy(prisma as never, { classId: 42, startTime, bibNumber: 101 }),
    ).resolves.toEqual(created);

    expect(prisma.startSlotVacancy.create).toHaveBeenCalledWith({
      data: { classId: 42, startTime, bibNumber: 101 },
    });
  });
});

describe('bulkCreateStartSlotVacancies', () => {
  it('createMany rows for a class with duplicate protection', async () => {
    const t1 = new Date('2026-06-01T09:30:00.000Z');
    const t2 = new Date('2026-06-01T09:32:00.000Z');
    const prisma = {
      startSlotVacancy: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };

    await expect(
      bulkCreateStartSlotVacancies(prisma as never, 42, [
        { startTime: t1 },
        { startTime: t2 },
      ]),
    ).resolves.toEqual({ count: 2 });

    expect(prisma.startSlotVacancy.createMany).toHaveBeenCalledWith({
      data: [
        { classId: 42, startTime: t1, bibNumber: null },
        { classId: 42, startTime: t2, bibNumber: null },
      ],
      skipDuplicates: true,
    });
  });

  it('stores bibNumber when provided in the slot', async () => {
    const t1 = new Date('2026-06-01T09:30:00.000Z');
    const prisma = {
      startSlotVacancy: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    await bulkCreateStartSlotVacancies(prisma as never, 42, [{ startTime: t1, bibNumber: 55 }]);

    expect(prisma.startSlotVacancy.createMany).toHaveBeenCalledWith({
      data: [{ classId: 42, startTime: t1, bibNumber: 55 }],
      skipDuplicates: true,
    });
  });

  it('returns a zero count and does not hit the database for an empty list', async () => {
    const prisma = {
      startSlotVacancy: { createMany: vi.fn() },
    };

    await expect(bulkCreateStartSlotVacancies(prisma as never, 42, [])).resolves.toEqual({
      count: 0,
    });

    expect(prisma.startSlotVacancy.createMany).not.toHaveBeenCalled();
  });
});

describe('listStartSlotVacanciesByClass', () => {
  it('lists vacancies for a class ordered by start time', async () => {
    const rows = [{ id: 1, classId: 42, startTime: new Date('2026-06-01T09:30:00.000Z') }];
    const prisma = {
      startSlotVacancy: { findMany: vi.fn().mockResolvedValue(rows) },
    };

    await expect(listStartSlotVacanciesByClass(prisma as never, 42)).resolves.toEqual(rows);

    expect(prisma.startSlotVacancy.findMany).toHaveBeenCalledWith({
      where: { classId: 42 },
      orderBy: { startTime: 'asc' },
    });
  });
});

describe('listEventStartSlotVacanciesGroupedByClass', () => {
  it('groups vacancies by class and excludes classes without vacancies', async () => {
    const t1 = new Date('2026-06-01T09:30:00.000Z');
    const t2 = new Date('2026-06-01T09:32:00.000Z');
    const prisma = {
      class: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 10,
            name: 'H21',
            startSlotVacancies: [
              { id: 1, startTime: t1, bibNumber: 101 },
              { id: 2, startTime: t2, bibNumber: null },
            ],
          },
          { id: 11, name: 'D21', startSlotVacancies: [] },
        ]),
      },
    };

    await expect(
      listEventStartSlotVacanciesGroupedByClass(prisma as never, 'event-1'),
    ).resolves.toEqual([
      {
        classId: 10,
        className: 'H21',
        vacancies: [
          { id: 1, startTime: t1, bibNumber: 101 },
          { id: 2, startTime: t2, bibNumber: null },
        ],
      },
    ]);

    expect(prisma.class.findMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
      select: {
        id: true,
        name: true,
        startSlotVacancies: {
          select: { id: true, startTime: true, bibNumber: true },
          orderBy: { startTime: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  });
});

describe('deleteStartSlotVacancy', () => {
  it('deletes a vacancy by id', async () => {
    const prisma = {
      startSlotVacancy: { delete: vi.fn().mockResolvedValue({ id: 5 }) },
    };

    await expect(deleteStartSlotVacancy(prisma as never, 5)).resolves.toEqual({ id: 5 });

    expect(prisma.startSlotVacancy.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });
});

describe('deleteMatchingStartSlotVacancy', () => {
  it('deletes the matching vacancy for the exact class and start time', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const tx = {
      startSlotVacancy: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };

    await deleteMatchingStartSlotVacancy(tx as never, { classId: 42, startTime });

    expect(tx.startSlotVacancy.deleteMany).toHaveBeenCalledWith({
      where: { classId: 42, startTime },
    });
  });

  it('does nothing when start time is missing', async () => {
    const tx = {
      startSlotVacancy: { deleteMany: vi.fn() },
    };

    await deleteMatchingStartSlotVacancy(tx as never, { classId: 42, startTime: null });
    await deleteMatchingStartSlotVacancy(tx as never, { classId: 42 });

    expect(tx.startSlotVacancy.deleteMany).not.toHaveBeenCalled();
  });

  it('scopes deletion to the given class so other classes are untouched', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const tx = {
      startSlotVacancy: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };

    await deleteMatchingStartSlotVacancy(tx as never, { classId: 99, startTime });

    const where = tx.startSlotVacancy.deleteMany.mock.calls[0][0].where;
    expect(where.classId).toBe(99);
    expect(where.startTime).toBe(startTime);
  });
});
