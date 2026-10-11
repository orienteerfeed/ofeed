/**
 * Team standings for multi-leg disciplines (RELAY / SPRINT_RELAY / TEAMS), shared
 * by the relay overall table and the cross-category live feed so the "broken team"
 * rule stays in one place instead of drifting per copy.
 */
import {
  rankByTime,
  type TimedEntry,
  type TimeRanking,
} from './result-ranking.utils';

/** Minimal shape needed to chain leg times into a team standing. */
export interface RelayLegRunner {
  leg?: number | undefined;
  teamId?: number | undefined;
  status: string;
  time?: number | undefined;
}

export interface RelayCumulativeStandings {
  /**
   * teamId → leg → cumulative time after that leg. A team has no entry from the
   * leg where it breaks onwards.
   */
  cumulativeTimeByTeam: Map<number, Map<number, number>>;
  /** leg → tie-aware ranking of teams by their cumulative time after that leg. */
  rankingByLeg: Map<number, TimeRanking>;
  /**
   * Teams missing an OK finisher on some leg (DSQ/DNF/DNS, or a readout that has
   * not arrived yet). Their team-level standing is void on every leg, including
   * the ones they did complete.
   */
  brokenTeamIds: Set<number>;
}

/**
 * Chain leg times into per-leg team standings within a single class. Pass only
 * competitors of one class — teams from different classes must not be ranked
 * against each other.
 *
 * `maxLeg` bounds how many legs are walked; it does not decide whether the race
 * is multi-leg (that comes from the event discipline via `event.relay`).
 */
export function computeRelayCumulativeStandings(
  competitors: readonly RelayLegRunner[],
  maxLeg: number
): RelayCumulativeStandings {
  const cumulativeTimeByTeam = new Map<number, Map<number, number>>();
  const rankingByLeg = new Map<number, TimeRanking>();
  const brokenTeamIds = new Set<number>();

  if (maxLeg <= 0) {
    return { cumulativeTimeByTeam, rankingByLeg, brokenTeamIds };
  }

  const teamMap = Map.groupBy(
    competitors.filter(
      (competitor): competitor is RelayLegRunner & { teamId: number } =>
        competitor.teamId != null
    ),
    competitor => competitor.teamId
  );

  for (const [teamId, runners] of teamMap) {
    const byLeg = new Map<number, RelayLegRunner>();
    for (const runner of runners) {
      if (runner.leg != null) byLeg.set(runner.leg, runner);
    }

    const cumulative = new Map<number, number>();
    let total = 0;
    let broken = false;
    for (let leg = 1; leg <= maxLeg; leg++) {
      if (broken) continue;
      const runner = byLeg.get(leg);
      if (!runner || runner.status !== 'OK' || runner.time == null) {
        broken = true;
        continue;
      }
      total += runner.time;
      cumulative.set(leg, total);
    }

    cumulativeTimeByTeam.set(teamId, cumulative);
    if (broken) brokenTeamIds.add(teamId);
  }

  for (let leg = 1; leg <= maxLeg; leg++) {
    const entries: TimedEntry[] = [];
    for (const [teamId, cumulative] of cumulativeTimeByTeam) {
      const time = cumulative.get(leg);
      if (time != null) entries.push({ id: String(teamId), time });
    }
    rankingByLeg.set(leg, rankByTime(entries));
  }

  return { cumulativeTimeByTeam, rankingByLeg, brokenTeamIds };
}
