import { describe, expect, it, vi } from 'vitest';

import {
  bulkCreateStartSlotVacancies,
  createStartSlotVacancy,
  createStartSlotVacancyForGraphQL,
  deleteMatchingStartSlotVacancy,
  deleteStartSlotVacancy,
  deleteStartSlotVacancyForGraphQL,
  listClassCompetitorStartTimesForGraphQL,
  listEventStartSlotVacanciesGroupedByClass,
  listStartSlotVacanciesByClass,
  updateStartSlotVacancyForGraphQL,
} from '../start-slot-vacancy.service.js';

function startSlotAuthPrisma(options?: {
  authorId?: number;
  role?: string;
  createResult?: unknown;
  updateResult?: unknown;
  deleteResult?: unknown;
  competitorStartTimes?: unknown;
  competitorAtStartTime?: unknown;
}) {
  const authorId = options?.authorId ?? 7;
  return {
    class: {
      findUnique: vi.fn().mockResolvedValue({ eventId: 'event-1' }),
    },
    startSlotVacancy: {
      findUnique: vi.fn().mockResolvedValue({ classId: 42, class: { eventId: 'event-1' } }),
      create: vi.fn().mockResolvedValue(options?.createResult ?? { id: 1 }),
      update: vi.fn().mockResolvedValue(options?.updateResult ?? { id: 5 }),
      delete: vi.fn().mockResolvedValue(options?.deleteResult ?? { id: 5 }),
    },
    competitor: {
      findMany: vi.fn().mockResolvedValue(options?.competitorStartTimes ?? []),
      findFirst: vi.fn().mockResolvedValue(options?.competitorAtStartTime ?? null),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue({ authorId }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ role: options?.role ?? 'USER' }),
    },
  };
}

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

describe('createStartSlotVacancyForGraphQL', () => {
  it('checks event ownership before creating a vacancy', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const created = { id: 1, classId: 42, startTime, bibNumber: null };
    const prisma = startSlotAuthPrisma({ createResult: created });

    await expect(
      createStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 7 },
        { classId: 42, startTime },
      ),
    ).resolves.toEqual(created);

    expect(prisma.startSlotVacancy.create).toHaveBeenCalledWith({
      data: { classId: 42, startTime, bibNumber: null },
    });
  });

  it('allows an application admin to create a vacancy', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const created = { id: 1, classId: 42, startTime, bibNumber: null };
    const prisma = startSlotAuthPrisma({ authorId: 7, role: 'ADMIN', createResult: created });

    await expect(
      createStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 99 },
        { classId: 42, startTime },
      ),
    ).resolves.toEqual(created);

    expect(prisma.startSlotVacancy.create).toHaveBeenCalledWith({
      data: { classId: 42, startTime, bibNumber: null },
    });
  });

  it('rejects a non-owner non-admin user before creating a vacancy', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const prisma = startSlotAuthPrisma({ authorId: 7, role: 'USER' });

    await expect(
      createStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 99 },
        { classId: 42, startTime },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized for this event',
    });

    expect(prisma.startSlotVacancy.create).not.toHaveBeenCalled();
  });

  it('rejects creating a vacancy when a competitor already has the same start time in the class', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const prisma = startSlotAuthPrisma({ competitorAtStartTime: { id: 123 } });

    await expect(
      createStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 7 },
        { classId: 42, startTime },
      ),
    ).rejects.toThrow('Start time is already assigned to a competitor in this class');

    expect(prisma.competitor.findFirst).toHaveBeenCalledWith({
      where: { classId: 42, startTime },
      select: { id: true },
    });
    expect(prisma.startSlotVacancy.create).not.toHaveBeenCalled();
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

describe('updateStartSlotVacancyForGraphQL', () => {
  it('checks event ownership and updates start time and bib number', async () => {
    const startTime = new Date('2026-06-01T09:45:00.000Z');
    const updated = { id: 5, startTime, bibNumber: 101 };
    const prisma = startSlotAuthPrisma({ updateResult: updated });

    await expect(
      updateStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 7 },
        { id: 5, startTime, bibNumber: 101 },
      ),
    ).resolves.toEqual(updated);

    expect(prisma.startSlotVacancy.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { startTime, bibNumber: 101 },
    });
  });

  it('rejects a non-owner non-admin user before updating a vacancy', async () => {
    const startTime = new Date('2026-06-01T09:45:00.000Z');
    const prisma = startSlotAuthPrisma({ authorId: 7, role: 'USER' });

    await expect(
      updateStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 99 },
        { id: 5, startTime, bibNumber: 101 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized for this event',
    });

    expect(prisma.startSlotVacancy.update).not.toHaveBeenCalled();
  });

  it('rejects updating a vacancy to a start time already assigned to a competitor in the class', async () => {
    const startTime = new Date('2026-06-01T09:45:00.000Z');
    const prisma = startSlotAuthPrisma({ competitorAtStartTime: { id: 123 } });

    await expect(
      updateStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 7 },
        { id: 5, startTime, bibNumber: 101 },
      ),
    ).rejects.toThrow('Start time is already assigned to a competitor in this class');

    expect(prisma.competitor.findFirst).toHaveBeenCalledWith({
      where: { classId: 42, startTime },
      select: { id: true },
    });
    expect(prisma.startSlotVacancy.update).not.toHaveBeenCalled();
  });
});

describe('listClassCompetitorStartTimesForGraphQL', () => {
  it('checks event ownership before listing competitor start times for the class', async () => {
    const startTime = new Date('2026-06-01T09:30:00.000Z');
    const prisma = startSlotAuthPrisma({
      competitorStartTimes: [{ id: 1, startTime }],
    });

    await expect(
      listClassCompetitorStartTimesForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 7 },
        42,
      ),
    ).resolves.toEqual([{ id: 1, startTime }]);

    expect(prisma.competitor.findMany).toHaveBeenCalledWith({
      where: {
        classId: 42,
        startTime: { not: null },
      },
      select: {
        id: true,
        startTime: true,
      },
      orderBy: { startTime: 'asc' },
    });
  });

  it('rejects a non-owner non-admin user before listing competitor start times', async () => {
    const prisma = startSlotAuthPrisma({ authorId: 7, role: 'USER' });

    await expect(
      listClassCompetitorStartTimesForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 99 },
        42,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized for this event',
    });

    expect(prisma.competitor.findMany).not.toHaveBeenCalled();
  });
});

describe('deleteStartSlotVacancyForGraphQL', () => {
  it('checks event ownership before deleting a vacancy', async () => {
    const prisma = startSlotAuthPrisma({ deleteResult: { id: 5 } });

    await expect(
      deleteStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 7 },
        5,
      ),
    ).resolves.toEqual({ message: 'Start slot vacancy deleted' });

    expect(prisma.startSlotVacancy.delete).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('rejects a non-owner non-admin user before deleting a vacancy', async () => {
    const prisma = startSlotAuthPrisma({ authorId: 7, role: 'USER' });

    await expect(
      deleteStartSlotVacancyForGraphQL(
        prisma as never,
        { isAuthenticated: true, type: 'jwt', userId: 99 },
        5,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized for this event',
    });

    expect(prisma.startSlotVacancy.delete).not.toHaveBeenCalled();
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
