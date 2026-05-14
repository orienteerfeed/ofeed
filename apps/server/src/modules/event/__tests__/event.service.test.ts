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
  eventImportState: {
    deleteMany: vi.fn(),
  },
  eventPassword: {
    deleteMany: vi.fn(),
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
    prismaMock.eventPassword.deleteMany.mockResolvedValue({ count: 1 });
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
});
