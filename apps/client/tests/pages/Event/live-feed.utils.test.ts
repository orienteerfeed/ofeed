import { describe, expect, it } from 'vitest';
import {
  compareByFinishDesc,
  matchesLiveFeedQuery,
  rankFeedRows,
  type LiveFeedRow,
} from '@/pages/Event/live-feed.utils';

const row = (overrides: Partial<LiveFeedRow> & { id: number }): LiveFeedRow => ({
  firstname: 'Jan',
  lastname: 'Novák',
  registration: 'KAM9403',
  organisation: 'OK Kamenice',
  organisationId: 7,
  status: 'OK',
  time: 1800,
  finishTime: '2026-08-28T10:00:00.000Z',
  updatedAt: '2026-08-28T10:00:05.000Z',
  leg: null,
  teamId: null,
  class: { id: 1, name: 'H21C', resultListMode: null },
  ...overrides,
});

describe('matchesLiveFeedQuery', () => {
  it('matches every row on an empty query', () => {
    expect(matchesLiveFeedQuery(row({ id: 1 }), '')).toBe(true);
    expect(matchesLiveFeedQuery(row({ id: 1 }), '   ')).toBe(true);
  });

  it('ignores diacritics in both the query and the data', () => {
    const competitor = row({ id: 1, lastname: 'Křivda', firstname: 'Martin' });
    expect(matchesLiveFeedQuery(competitor, 'krivda')).toBe(true);
    expect(matchesLiveFeedQuery(competitor, 'KŘIVDA')).toBe(true);
  });

  it('matches on the registration number', () => {
    expect(matchesLiveFeedQuery(row({ id: 1 }), 'kam9403')).toBe(true);
    expect(matchesLiveFeedQuery(row({ id: 1 }), 'KAM9403')).toBe(true);
  });

  it('matches on the club name', () => {
    expect(matchesLiveFeedQuery(row({ id: 1 }), 'kamenice')).toBe(true);
  });

  it('requires every token to hit, so extra tokens narrow the result', () => {
    const competitor = row({ id: 1, lastname: 'Křivda' });
    expect(matchesLiveFeedQuery(competitor, 'krivda kam')).toBe(true);
    expect(matchesLiveFeedQuery(competitor, 'krivda praha')).toBe(false);
  });

  it('tolerates a missing club and registration', () => {
    const competitor = row({ id: 1, organisation: null, registration: null });
    expect(matchesLiveFeedQuery(competitor, 'novak')).toBe(true);
    expect(matchesLiveFeedQuery(competitor, 'kamenice')).toBe(false);
  });
});

describe('compareByFinishDesc', () => {
  it('orders by finish time, newest first', () => {
    const older = row({ id: 1, finishTime: '2026-08-28T10:00:00.000Z' });
    const newer = row({ id: 2, finishTime: '2026-08-28T11:00:00.000Z' });
    expect([older, newer].sort(compareByFinishDesc).map(r => r.id)).toEqual([
      2, 1,
    ]);
  });

  it('ignores the readout time when a finish time is present', () => {
    // Later readout, earlier finish — the Finish column shows the finish time,
    // so the row belongs below the competitor who finished after it.
    const lateReadout = row({
      id: 1,
      finishTime: '2026-08-28T10:00:00.000Z',
      updatedAt: '2026-08-28T13:00:00.000Z',
    });
    const lateFinish = row({
      id: 2,
      finishTime: '2026-08-28T11:00:00.000Z',
      updatedAt: '2026-08-28T11:00:05.000Z',
    });
    expect(
      [lateReadout, lateFinish].sort(compareByFinishDesc).map(r => r.id)
    ).toEqual([2, 1]);
  });

  it('orders a readout fallback by its clock time, not by its date', () => {
    // The grey "finish time unknown" rows carry `updatedAt`, which usually sits on
    // a different day than the real finish times — the column shows clock time, so
    // a 10:31:20 readout belongs below a 15:06:06 finish.
    const laterDayEarlierClock = row({
      id: 1,
      finishTime: null,
      updatedAt: '2026-08-30T10:31:20.000Z',
    });
    const earlierDayLaterClock = row({
      id: 2,
      finishTime: '2026-08-28T15:06:06.000Z',
      updatedAt: '2026-08-28T15:06:10.000Z',
    });
    expect(
      [laterDayEarlierClock, earlierDayLaterClock]
        .sort(compareByFinishDesc)
        .map(r => r.id)
    ).toEqual([2, 1]);
  });

  it('falls back to the readout time when the finish time is missing', () => {
    const withFinish = row({
      id: 1,
      finishTime: '2026-08-28T09:00:00.000Z',
      updatedAt: '2026-08-28T09:00:00.000Z',
    });
    const withoutFinish = row({
      id: 2,
      finishTime: null,
      updatedAt: '2026-08-28T12:00:00.000Z',
    });
    expect(
      [withFinish, withoutFinish].sort(compareByFinishDesc).map(r => r.id)
    ).toEqual([2, 1]);
  });
});

describe('rankFeedRows - individual races', () => {
  it('ranks by race time inside the category', () => {
    const ranks = rankFeedRows(
      [
        row({ id: 1, time: 1900 }),
        row({ id: 2, time: 1700 }),
        row({ id: 3, time: 1800 }),
      ],
      false
    );
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(3)).toBe(2);
    expect(ranks.get(1)).toBe(3);
  });

  it('shares a rank on equal times and resumes after the tie', () => {
    const ranks = rankFeedRows(
      [
        row({ id: 1, time: 1700 }),
        row({ id: 2, time: 1700 }),
        row({ id: 3, time: 1800 }),
      ],
      false
    );
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(3)).toBe(3);
  });

  it('ranks each category independently', () => {
    const ranks = rankFeedRows(
      [
        row({ id: 1, time: 1900, class: { id: 1, name: 'H21C' } }),
        row({ id: 2, time: 2500, class: { id: 2, name: 'D21C' } }),
      ],
      false
    );
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(1);
  });

  it('skips non-OK statuses and non-positive times', () => {
    const ranks = rankFeedRows(
      [
        row({ id: 1, status: 'MissingPunch', time: 1700 }),
        row({ id: 2, status: 'OK', time: 0 }),
        row({ id: 3, status: 'OK', time: 1800 }),
      ],
      false
    );
    expect(ranks.has(1)).toBe(false);
    expect(ranks.has(2)).toBe(false);
    expect(ranks.get(3)).toBe(1);
  });

  it('ranks by own time even when legs are populated', () => {
    const ranks = rankFeedRows(
      [
        row({ id: 1, time: 1900, leg: 1, teamId: 10 }),
        row({ id: 2, time: 1700, leg: 2, teamId: 20 }),
      ],
      false
    );
    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(1)).toBe(2);
  });
});

describe('rankFeedRows - multi-leg disciplines', () => {
  const relayRow = (
    id: number,
    teamId: number,
    leg: number,
    time: number | null,
    status = 'OK'
  ) =>
    row({
      id,
      teamId,
      leg,
      time,
      status,
      class: { id: 5, name: 'H', resultListMode: null },
    });

  it('uses the team overall standing, not the runner leg placement', () => {
    // Team 20 owns the fastest second leg (1500) but is behind overall.
    const ranks = rankFeedRows(
      [
        relayRow(1, 10, 1, 1000),
        relayRow(2, 10, 2, 1600),
        relayRow(3, 20, 1, 2000),
        relayRow(4, 20, 2, 1500),
      ],
      true
    );

    expect(ranks.get(2)).toBe(1);
    expect(ranks.get(4)).toBe(2);
  });

  it('ranks the first leg on its own cumulative time', () => {
    const ranks = rankFeedRows(
      [relayRow(1, 10, 1, 1000), relayRow(2, 20, 1, 2000)],
      true
    );
    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(2);
  });

  it('drops the standing on the broken leg but keeps earlier handovers', () => {
    const ranks = rankFeedRows(
      [
        relayRow(1, 10, 1, 1000),
        relayRow(2, 10, 2, 1600, 'Disqualified'),
        relayRow(3, 20, 1, 2000),
      ],
      true
    );

    // The leg-1 handover really did happen in the lead; only the DSQ'd leg has
    // no standing. Teams still out on later legs keep their leg-1 placement.
    expect(ranks.get(1)).toBe(1);
    expect(ranks.has(2)).toBe(false);
    expect(ranks.get(3)).toBe(2);
  });

  it('leaves a later leg unranked while an earlier readout is missing', () => {
    const ranks = rankFeedRows(
      [relayRow(1, 10, 2, 1600), relayRow(2, 20, 1, 2000)],
      true
    );

    expect(ranks.has(1)).toBe(false);
    expect(ranks.get(2)).toBe(1);
  });

  it('produces no ranks when no legs are populated', () => {
    const ranks = rankFeedRows(
      [row({ id: 1, teamId: 10, leg: null, time: 1000 })],
      true
    );
    expect(ranks.size).toBe(0);
  });

  it('keeps teams of different categories apart', () => {
    const ranks = rankFeedRows(
      [
        relayRow(1, 10, 1, 2000),
        row({
          id: 2,
          teamId: 20,
          leg: 1,
          time: 1000,
          class: { id: 6, name: 'D', resultListMode: null },
        }),
      ],
      true
    );

    expect(ranks.get(1)).toBe(1);
    expect(ranks.get(2)).toBe(1);
  });
});
