import { describe, expect, it } from 'vitest';
import {
  computeRelayCumulativeStandings,
  type RelayLegRunner,
} from '@/pages/Event/relay-results.utils';

const runner = (
  teamId: number,
  leg: number,
  time: number | undefined,
  status = 'OK'
): RelayLegRunner => ({ teamId, leg, time, status });

describe('computeRelayCumulativeStandings', () => {
  it('chains leg times into cumulative team times', () => {
    const { cumulativeTimeByTeam } = computeRelayCumulativeStandings(
      [runner(10, 1, 1000), runner(10, 2, 1600)],
      2
    );

    expect(cumulativeTimeByTeam.get(10)?.get(1)).toBe(1000);
    expect(cumulativeTimeByTeam.get(10)?.get(2)).toBe(2600);
  });

  it('ranks teams by cumulative time on each leg', () => {
    const { rankingByLeg } = computeRelayCumulativeStandings(
      [
        runner(10, 1, 1000),
        runner(10, 2, 1600),
        runner(20, 1, 2000),
        runner(20, 2, 1500),
      ],
      2
    );

    // Leg 1: team 10 leads. Leg 2: 2600 vs 3500, team 10 still leads even though
    // team 20 ran the faster second leg.
    expect(rankingByLeg.get(1)?.rankById.get('10')).toBe(1);
    expect(rankingByLeg.get(1)?.rankById.get('20')).toBe(2);
    expect(rankingByLeg.get(2)?.rankById.get('10')).toBe(1);
    expect(rankingByLeg.get(2)?.rankById.get('20')).toBe(2);
  });

  it('shares a rank on equal cumulative times', () => {
    const { rankingByLeg } = computeRelayCumulativeStandings(
      [runner(10, 1, 1000), runner(20, 1, 1000), runner(30, 1, 1200)],
      1
    );

    expect(rankingByLeg.get(1)?.rankById.get('10')).toBe(1);
    expect(rankingByLeg.get(1)?.rankById.get('20')).toBe(1);
    expect(rankingByLeg.get(1)?.rankById.get('30')).toBe(3);
  });

  it('marks a team broken and drops its standing from the broken leg on', () => {
    const { cumulativeTimeByTeam, rankingByLeg, brokenTeamIds } =
      computeRelayCumulativeStandings(
        [
          runner(10, 1, 1000),
          runner(10, 2, 1600, 'Disqualified'),
          runner(10, 3, 1500),
        ],
        3
      );

    expect(brokenTeamIds.has(10)).toBe(true);
    expect(cumulativeTimeByTeam.get(10)?.get(1)).toBe(1000);
    expect(cumulativeTimeByTeam.get(10)?.has(2)).toBe(false);
    expect(cumulativeTimeByTeam.get(10)?.has(3)).toBe(false);
    expect(rankingByLeg.get(3)?.rankById.has('10')).toBe(false);
  });

  it('treats a missing leg as broken', () => {
    const { brokenTeamIds, cumulativeTimeByTeam } =
      computeRelayCumulativeStandings([runner(10, 2, 1600)], 2);

    expect(brokenTeamIds.has(10)).toBe(true);
    expect(cumulativeTimeByTeam.get(10)?.size).toBe(0);
  });

  it('treats a missing time as broken', () => {
    const { brokenTeamIds } = computeRelayCumulativeStandings(
      [runner(10, 1, undefined)],
      1
    );
    expect(brokenTeamIds.has(10)).toBe(true);
  });

  it('ignores competitors without a team', () => {
    const { cumulativeTimeByTeam } = computeRelayCumulativeStandings(
      [{ leg: 1, time: 1000, status: 'OK' }],
      1
    );
    expect(cumulativeTimeByTeam.size).toBe(0);
  });

  it('returns empty standings for a non-positive leg count', () => {
    const { cumulativeTimeByTeam, rankingByLeg, brokenTeamIds } =
      computeRelayCumulativeStandings([runner(10, 1, 1000)], 0);

    expect(cumulativeTimeByTeam.size).toBe(0);
    expect(rankingByLeg.size).toBe(0);
    expect(brokenTeamIds.size).toBe(0);
  });
});
