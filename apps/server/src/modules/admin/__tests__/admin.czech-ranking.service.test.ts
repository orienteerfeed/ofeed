import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAdminCzechRankingEventResults,
  clearAdminCzechRankingSnapshots,
  getAdminCzechRankingOverview,
  getAdminCzechRankingSnapshotDetail,
  syncAdminCzechRankingEventResults,
  uploadAdminCzechRankingSnapshot,
} from '../admin.czech-ranking.service.js';
import { NotFoundError } from '../../../exceptions/index.js';
import { syncCzechRankingEventResultsFromOris } from '../../../utils/czech-ranking-oris.js';
import {
  normalizeCzechRankingMonthInput,
  storeCzechRankingData,
} from '../../upload/upload.service.js';

vi.mock('../../../utils/czech-ranking-oris.js', () => ({
  syncCzechRankingEventResultsFromOris: vi.fn(),
}));

vi.mock('../../upload/upload.service.js', () => ({
  normalizeCzechRankingMonthInput: vi.fn(),
  storeCzechRankingData: vi.fn(),
}));

describe('admin Czech ranking service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds Czech ranking overview datasets', async () => {
    const prisma = {
      rankingCzech: {
        groupBy: vi.fn().mockResolvedValue([
          {
            rankingType: 'FOREST',
            rankingCategory: 'M',
            validForMonth: new Date('2026-02-01T00:00:00.000Z'),
            _count: { _all: 3 },
            _max: { updatedAt: new Date('2026-03-01T12:00:00.000Z') },
          },
        ]),
        count: vi.fn().mockResolvedValue(3),
        findFirst: vi.fn().mockResolvedValue({
          firstName: 'Jakub',
          lastName: 'Chaloupský',
          registration: 'PHK0302',
        }),
      },
      czechRankingEventResult: {
        groupBy: vi.fn().mockResolvedValue([
          {
            externalEventId: '8835',
            eventDate: new Date('2025-10-11T00:00:00.000Z'),
            rankingType: 'FOREST',
            rankingCategory: 'M',
            _count: { _all: 2 },
            _max: { syncedAt: new Date('2026-04-01T08:00:00.000Z') },
          },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
      event: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'evt-1',
            name: 'Oblastní žebříček',
            externalEventId: '8835',
          },
        ]),
      },
    };

    const result = await getAdminCzechRankingOverview(prisma);

    expect(result.summary).toMatchObject({
      snapshotDatasetCount: 1,
      snapshotEntryCount: 3,
      eventDatasetCount: 1,
      eventResultCount: 2,
    });
    expect(result.snapshotDatasets[0]).toMatchObject({
      rankingType: 'FOREST',
      rankingCategory: 'M',
      leaderName: 'Jakub Chaloupský',
    });
    expect(result.eventResultDatasets[0]).toMatchObject({
      externalEventId: '8835',
      localEventName: 'Oblastní žebříček',
    });
  });

  it('throws not found when snapshot dataset is missing', async () => {
    const prisma = {
      rankingCzech: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await expect(
      getAdminCzechRankingSnapshotDetail(prisma, {
        rankingType: 'SPRINT',
        rankingCategory: 'F',
        validForMonth: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('uploads Czech ranking snapshot data through shared upload service', async () => {
    vi.mocked(normalizeCzechRankingMonthInput).mockReturnValue(
      new Date('2026-02-01T00:00:00.000Z'),
    );
    vi.mocked(storeCzechRankingData).mockResolvedValue(11);

    const result = await uploadAdminCzechRankingSnapshot({
      csvData: 'csv-data',
      rankingType: 'FOREST',
      rankingCategory: 'M',
      validForMonthInput: '2026-02',
    });

    expect(storeCzechRankingData).toHaveBeenCalledWith({
      csvData: 'csv-data',
      rankingType: 'FOREST',
      rankingCategory: 'M',
      validForMonth: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(result).toMatchObject({
      rankingType: 'FOREST',
      rankingCategory: 'M',
      importedEntries: 11,
    });
  });

  it('forces ORIS synchronization for all ranking types', async () => {
    vi.mocked(syncCzechRankingEventResultsFromOris)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    const result = await syncAdminCzechRankingEventResults(
      'ALL',
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(syncCzechRankingEventResultsFromOris).toHaveBeenCalledTimes(2);
    expect(result.scope).toBe('ALL');
    expect(result.syncedTypes).toEqual(['FOREST', 'SPRINT']);
    expect(result.syncedEvents).toBe(5);
  });

  it('clears stored snapshot and ORIS event result rows', async () => {
    const prisma = {
      rankingCzech: {
        deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
      },
      czechRankingEventResult: {
        deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
      },
    };

    const snapshotsResult = await clearAdminCzechRankingSnapshots(prisma, {
      rankingType: 'FOREST',
      rankingCategory: 'M',
      validForMonth: new Date('2026-02-01T00:00:00.000Z'),
    });
    const eventResults = await clearAdminCzechRankingEventResults(prisma, {
      externalEventId: '8835',
      rankingType: 'FOREST',
      rankingCategory: 'M',
    });

    expect(prisma.rankingCzech.deleteMany).toHaveBeenCalled();
    expect(prisma.czechRankingEventResult.deleteMany).toHaveBeenCalled();
    expect(snapshotsResult.deletedCount).toBe(4);
    expect(eventResults.deletedCount).toBe(7);
  });
});
