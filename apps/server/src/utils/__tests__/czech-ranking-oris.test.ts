import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, loadOrisEventCandidatesByDateRangeMock, loggerMock } = vi.hoisted(() => ({
  prismaMock: {
    czechRankingEventResult: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (steps: unknown[]) => Promise.all(steps as Promise<unknown>[])),
  },
  loadOrisEventCandidatesByDateRangeMock: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../context.js', () => ({
  default: prismaMock,
}));

vi.mock('../../modules/event/event.import.service.js', () => ({
  loadOrisEventCandidatesByDateRange: loadOrisEventCandidatesByDateRangeMock,
}));

vi.mock('../../lib/logging.js', () => ({
  logger: loggerMock,
}));

import {
  ensureCzechRankingEventResultsSynchronized,
  resetCzechRankingOrisSyncStateForTesting,
  syncCzechRankingEventResultsFromOris,
  waitForCzechRankingOrisSyncsForTesting,
} from '../czech-ranking-oris.js';

describe('czech-ranking-oris', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCzechRankingOrisSyncStateForTesting();
    prismaMock.czechRankingEventResult.deleteMany.mockClear();
    prismaMock.czechRankingEventResult.createMany.mockClear();
    prismaMock.czechRankingEventResult.findFirst.mockClear();
    prismaMock.$transaction.mockClear();
    loadOrisEventCandidatesByDateRangeMock.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();
    loggerMock.debug.mockReset();
    loggerMock.fatal.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetCzechRankingOrisSyncStateForTesting();
  });

  it('syncs official ORIS Czech ranking event results into the local table', async () => {
    loadOrisEventCandidatesByDateRangeMock.mockResolvedValue([
      {
        externalEventId: '6302',
        name: 'Ranking event',
        date: '2026-03-15',
        ranking: true,
        relay: false,
        discipline: 'LONG',
      },
      {
        externalEventId: '6303',
        name: 'Not ranked',
        date: '2026-03-16',
        ranking: false,
        relay: false,
        discipline: 'LONG',
      },
    ]);

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Data: {
              RankingType_2: {
                ID: '2',
                NameCZ: 'Lesní ranking (12 měsíců, 5 závodů)',
                NameEN: 'Forest ranking (12 months, 5 events)',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            Data: {
              RankResult_1: {
                ID: '1',
                ClassID: '145214',
                ClassDesc: 'D21',
                Place: '1',
                Name: 'Runner One',
                RegNo: 'PGP8556',
                Time: '36:04',
                Points: '4800',
                UserKoef: '8133',
                UserID: '3631',
                Type: '2',
              },
              RankResult_2: {
                ID: '2',
                ClassID: '145228',
                ClassDesc: 'H21',
                Place: '2',
                Name: 'Runner Two',
                RegNo: 'SJH9201',
                Time: '34:33',
                Points: '5234',
                UserKoef: '5364',
                UserID: '4590',
                Type: '2',
              },
              RankResult_3: {
                ID: '3',
                ClassID: '145229',
                ClassDesc: 'H35',
                Place: '1',
                Name: 'Veteran',
                RegNo: 'AAA1234',
                Time: '35:00',
                Points: '4999',
                UserKoef: '6000',
                UserID: '111',
                Type: '2',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    await syncCzechRankingEventResultsFromOris({
      rankingType: 'FOREST',
      dateFrom: new Date('2026-03-01T00:00:00.000Z'),
      dateTo: new Date('2026-03-31T00:00:00.000Z'),
    });

    expect(loadOrisEventCandidatesByDateRangeMock).toHaveBeenCalledWith({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.czechRankingEventResult.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          externalEventId: '6302',
          rankingType: 'FOREST',
          rankingCategory: 'F',
          className: 'D21',
          registration: 'PGP8556',
          rankingPoints: 4800,
          rankingReferenceValue: 8133,
        }),
        expect.objectContaining({
          externalEventId: '6302',
          rankingType: 'FOREST',
          rankingCategory: 'M',
          className: 'H21',
          registration: 'SJH9201',
          rankingPoints: 5234,
          rankingReferenceValue: 5364,
        }),
      ],
    });
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Czech ranking ORIS sync started',
      expect.objectContaining({
        rankingType: 'FOREST',
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      }),
    );
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Czech ranking ORIS sync completed',
      expect.objectContaining({
        rankingType: 'FOREST',
        eventsFound: 1,
        eventsSynced: 1,
      }),
    );
  });

  it('skips remote sync when recent official data already exists', async () => {
    prismaMock.czechRankingEventResult.findFirst.mockResolvedValue({
      syncedAt: new Date('2026-03-31T11:00:00.000Z'),
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const didSync = await ensureCzechRankingEventResultsSynchronized({
      rankingType: 'SPRINT',
      windowStart: new Date('2024-04-01T00:00:00.000Z'),
      now: new Date('2026-03-31T12:00:00.000Z'),
    });

    expect(didSync).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      'Czech ranking ORIS sync skipped because recent data already exists',
      expect.objectContaining({
        rankingType: 'SPRINT',
        latestSyncedAt: '2026-03-31T11:00:00.000Z',
      }),
    );
  });

  it('starts remote sync in background when called in non-blocking mode', async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const pendingFetch = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    prismaMock.czechRankingEventResult.findFirst.mockResolvedValue(null);
    loadOrisEventCandidatesByDateRangeMock.mockResolvedValue([]);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(pendingFetch);

    const didSync = await ensureCzechRankingEventResultsSynchronized({
      rankingType: 'SPRINT',
      windowStart: new Date('2024-04-01T00:00:00.000Z'),
      now: new Date('2026-03-31T12:00:00.000Z'),
      blocking: false,
    });

    expect(didSync).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch?.(
      new Response(
        JSON.stringify({
          Data: {
            RankingType_8: {
              ID: '8',
              NameCZ: 'Sprintovy ranking',
              NameEN: 'Sprint ranking',
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await waitForCzechRankingOrisSyncsForTesting();
  });

  it('logs cooldown metadata when ORIS sync fails', async () => {
    prismaMock.czechRankingEventResult.findFirst.mockResolvedValue(null);
    loadOrisEventCandidatesByDateRangeMock.mockRejectedValue(new Error('ORIS timeout'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Data: {
            RankingType_2: {
              ID: '2',
              NameCZ: 'Lesní ranking (12 měsíců, 5 závodů)',
              NameEN: 'Forest ranking (12 months, 5 events)',
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      ensureCzechRankingEventResultsSynchronized({
        rankingType: 'FOREST',
        windowStart: new Date('2025-04-01T00:00:00.000Z'),
        now: new Date('2026-03-31T12:00:00.000Z'),
      }),
    ).rejects.toThrow('ORIS timeout');

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Czech ranking ORIS sync failed and cooldown was applied',
      expect.objectContaining({
        rankingType: 'FOREST',
        failureReason: 'ORIS timeout',
      }),
    );
  });
});
