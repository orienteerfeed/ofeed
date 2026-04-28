import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  competitor: {
    findFirst: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  protocol: {
    createMany: vi.fn(),
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

import { changeCompetitorStatus } from '../event.service.js';

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
