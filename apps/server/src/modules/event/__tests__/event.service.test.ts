import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  competitor: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  class: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  course: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  courseControl: {
    deleteMany: vi.fn(),
  },
  control: {
    deleteMany: vi.fn(),
  },
  courseMap: {
    deleteMany: vi.fn(),
  },
  eventImportState: {
    deleteMany: vi.fn(),
  },
  eventPassword: {
    deleteMany: vi.fn(),
  },
  eventService: {
    deleteMany: vi.fn(),
  },
  event: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  organisation: {
    deleteMany: vi.fn(),
  },
  protocol: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  split: {
    deleteMany: vi.fn(),
  },
  team: {
    deleteMany: vi.fn(),
  },
}));

const subscriptionMocks = vi.hoisted(() => ({
  publishUpdatedCompetitor: vi.fn(),
  publishUpdatedCompetitors: vi.fn(),
}));

vi.mock('../../../utils/context.js', () => ({
  default: prismaMock,
}));

vi.mock('../../../utils/subscriptionUtils.js', () => subscriptionMocks);

import {
  changeCompetitorStatus,
  deleteAllEventData,
  deleteEventCompetitors,
  getEventSlugAvailability,
  normalizeEventSlug,
} from '../event.service.js';

describe('event.service changeCompetitorStatus', () => {
  beforeEach(() => {
    prismaMock.competitor.findFirst.mockResolvedValue({
      id: 7,
      classId: 3,
      status: 'Active',
      lateStart: false,
      card: null,
    });
    prismaMock.competitor.update.mockResolvedValue({});
    prismaMock.competitor.findUnique.mockResolvedValue({
      id: 7,
      classId: 3,
      status: 'Active',
      lateStart: true,
      class: {},
      team: null,
    });
    prismaMock.protocol.createMany.mockResolvedValue({ count: 1 });
    subscriptionMocks.publishUpdatedCompetitor.mockResolvedValue(undefined);
    subscriptionMocks.publishUpdatedCompetitors.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs late start changes even when the persisted status remains Active', async () => {
    await changeCompetitorStatus('event-1', 7, 'START', 'LateStart', 11);

    expect(prismaMock.competitor.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { status: 'Active', lateStart: true },
    });
    expect(prismaMock.protocol.createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: 'event-1',
          competitorId: 7,
          origin: 'START',
          type: 'late_start_change',
          previousValue: 'false',
          newValue: 'true',
          authorId: 11,
        },
      ],
    });
  });
});

describe('event.service event data deletion', () => {
  beforeEach(() => {
    prismaMock.class.findMany.mockResolvedValue([{ id: 3 }, { id: 4 }]);
    prismaMock.competitor.findMany.mockResolvedValue([{ id: 7 }, { id: 8 }]);
    prismaMock.protocol.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.split.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.competitor.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.team.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.organisation.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.class.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.course.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    prismaMock.course.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.courseControl.deleteMany.mockResolvedValue({ count: 4 });
    prismaMock.control.deleteMany.mockResolvedValue({ count: 6 });
    prismaMock.courseMap.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.eventPassword.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.eventService.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.eventImportState.deleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('deletes import state after deleting event competitors', async () => {
    await deleteEventCompetitors('event-1');

    expect(prismaMock.eventImportState.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
  });

  it('deletes import state after deleting all event data', async () => {
    await deleteAllEventData('event-1');

    expect(prismaMock.eventImportState.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
  });

  it('deletes event services with all event data', async () => {
    await deleteAllEventData('event-1');

    expect(prismaMock.eventService.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
  });

  it('deletes course data (courses, course controls, controls, maps) with all event data', async () => {
    await deleteAllEventData('event-1');

    expect(prismaMock.courseControl.deleteMany).toHaveBeenCalledWith({
      where: { courseId: { in: [10, 11] } },
    });
    expect(prismaMock.course.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
    expect(prismaMock.control.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
    expect(prismaMock.courseMap.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
  });
});

describe('event.service event slug', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes user input into a URL-safe slug', () => {
    expect(normalizeEventSlug(' Sprint Zákupy 2026! ')).toBe('sprint-zakupy-2026');
  });

  it('rejects slugs shorter than six characters before querying the database', async () => {
    const availability = await getEventSlugAvailability(prismaMock as never, 'abc');

    expect(availability).toEqual({
      slug: 'abc',
      available: false,
      reason: 'TOO_SHORT',
    });
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled();
  });

  it('rejects slugs that look like generated event ids before querying the database', async () => {
    const availability = await getEventSlugAvailability(
      prismaMock as never,
      'cmnfo6rgk00008m2cd39gm0xk',
    );

    expect(availability).toEqual({
      slug: 'cmnfo6rgk00008m2cd39gm0xk',
      available: false,
      reason: 'RESERVED',
    });
    expect(prismaMock.event.findFirst).not.toHaveBeenCalled();
  });

  it('marks a valid unused slug as available', async () => {
    prismaMock.event.findFirst.mockResolvedValue(null);

    await expect(getEventSlugAvailability(prismaMock as never, 'sprint-zakupy')).resolves.toEqual({
      slug: 'sprint-zakupy',
      available: true,
      reason: null,
    });
  });

  it('checks uniqueness while ignoring the current event', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'other-event' });

    await expect(
      getEventSlugAvailability(prismaMock as never, 'sprint-zakupy', 'current-event'),
    ).resolves.toEqual({
      slug: 'sprint-zakupy',
      available: false,
      reason: 'TAKEN',
    });
    expect(prismaMock.event.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            slug: 'sprint-zakupy',
            id: { not: 'current-event' },
          },
          { id: 'sprint-zakupy' },
        ],
      },
      select: { id: true },
    });
  });

  it('marks a slug as unavailable when it matches any existing event id', async () => {
    prismaMock.event.findFirst.mockResolvedValue({ id: 'sprint-zakupy' });

    await expect(
      getEventSlugAvailability(prismaMock as never, 'sprint-zakupy', 'current-event'),
    ).resolves.toEqual({
      slug: 'sprint-zakupy',
      available: false,
      reason: 'TAKEN',
    });
  });
});
