/**
 * Live ranking at radio (online split) controls for the individual results
 * table: per-control ranks and the provisional placement of runners who are
 * still on course, based on their last known radio split.
 */
import { rankByTime } from './result-ranking.utils';

export interface RadioSplit {
  controlCode: number;
  time?: number | null;
}

export interface RadioRankedCompetitor {
  id: string;
  status: string;
  time?: number | null;
  startTime?: string | null;
  finishTime?: string | null;
  radioSplits?: readonly RadioSplit[] | null;
}

/** Statuses that compete for a place at a radio control. */
const RADIO_RANKED_STATUSES = new Set(['OK', 'Active', 'Finished']);

/** Statuses that get a provisional place from their last radio split. */
const PROVISIONAL_STATUSES = new Set(['Active', 'Finished']);

const getRankedRadioEntries = (
  competitors: readonly RadioRankedCompetitor[],
  code: string
) =>
  competitors.flatMap(competitor => {
    const time = RADIO_RANKED_STATUSES.has(competitor.status)
      ? getRadioTime(competitor, code)
      : undefined;
    return time === undefined ? [] : [{ id: competitor.id, time }];
  });

export function getRadioTime(
  competitor: RadioRankedCompetitor,
  code: string
): number | undefined {
  // Compare numerically: the server matches codes as numbers, so '031' is 31.
  const numericCode = Number(code);
  const split = competitor.radioSplits?.find(
    candidate => candidate.controlCode === numericCode
  );
  return split?.time != null && split.time > 0 ? split.time : undefined;
}

/** Column for the elapsed clock; undefined keeps it in the finish column. */
export function getRunningRadioCode(
  competitor: RadioRankedCompetitor,
  codes: readonly string[],
  currentTime: number
): string | undefined {
  if (competitor.status !== 'Active' || !competitor.startTime) return undefined;
  const start = Date.parse(competitor.startTime);
  if (!Number.isFinite(start) || start > currentTime) return undefined;
  return codes.find(code => getRadioTime(competitor, code) === undefined);
}

/** Rank per radio control code, keyed by competitor id (tie-aware). */
export function buildRadioRanks(
  competitors: readonly RadioRankedCompetitor[],
  codes: readonly string[]
): Map<string, Map<string, number>> {
  const ranks = new Map<string, Map<string, number>>();
  for (const code of codes) {
    ranks.set(
      code,
      rankByTime(getRankedRadioEntries(competitors, code)).rankById
    );
  }
  return ranks;
}

/** Fastest valid time at each radio control, using the same runners as ranks. */
export function buildRadioBestTimes(
  competitors: readonly RadioRankedCompetitor[],
  codes: readonly string[]
): Map<string, number> {
  const bestTimes = new Map<string, number>();
  for (const code of codes) {
    const bestTime = rankByTime(
      getRankedRadioEntries(competitors, code)
    ).bestTime;
    if (bestTime !== undefined) bestTimes.set(code, bestTime);
  }
  return bestTimes;
}

/** The furthest radio control (in course order) the competitor has a time at. */
export function getLastRadio(
  competitor: RadioRankedCompetitor,
  codes: readonly string[]
): { code: string; time: number } | undefined {
  for (let index = codes.length - 1; index >= 0; index--) {
    const code = codes[index]!;
    const time = getRadioTime(competitor, code);
    if (time !== undefined) {
      return { code, time };
    }
  }
  return undefined;
}

export function isProvisionallyPlaced(
  competitor: RadioRankedCompetitor,
  codes: readonly string[]
): boolean {
  return (
    PROVISIONAL_STATUSES.has(competitor.status) &&
    (competitor.status === 'Finished' ||
      getLastRadio(competitor, codes) !== undefined)
  );
}

export function getProvisionalFinishTime(
  competitor: RadioRankedCompetitor
): number | undefined {
  if (competitor.status !== 'Finished') return undefined;
  if (competitor.time != null && competitor.time > 0) return competitor.time;
  if (!competitor.startTime || !competitor.finishTime) return undefined;
  const duration =
    (Date.parse(competitor.finishTime) - Date.parse(competitor.startTime)) /
    1000;
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

/**
 * Inserts runners still on course into the (already sorted) OK block: each goes
 * right after the finishers who were at least as fast at the runner's last
 * known radio control. Finishers without a time there are not compared; when
 * none has one, the runner stays after the whole OK block.
 */
export function placeProvisional<T extends RadioRankedCompetitor>(
  sortedOk: readonly T[],
  pending: readonly T[],
  codes: readonly string[]
): T[] {
  const placed = pending
    .map(competitor => {
      const last = getLastRadio(competitor, codes);
      const finishTime = getProvisionalFinishTime(competitor);
      const time = finishTime ?? last?.time;
      const comparable =
        finishTime !== undefined
          ? sortedOk.flatMap((ok, index) =>
              ok.time != null && ok.time > 0 ? [{ time: ok.time, index }] : []
            )
          : last
            ? sortedOk.flatMap((ok, index) => {
                const okTime = getRadioTime(ok, last.code);
                return okTime === undefined ? [] : [{ time: okTime, index }];
              })
            : [];
      // No finisher timed there (e.g. results imported without splits): keep
      // the runner after the finishers instead of above the leader.
      const index =
        time !== undefined && comparable.length > 0
          ? (comparable.findLast(ok => ok.time <= time)?.index ?? -1) + 1
          : sortedOk.length;
      return { competitor, index, time: time ?? Infinity };
    })
    .sort((a, b) => a.index - b.index || a.time - b.time);

  const result: T[] = [];
  let next = 0;
  sortedOk.forEach((ok, okIndex) => {
    while (next < placed.length && placed[next]!.index <= okIndex) {
      result.push(placed[next++]!.competitor);
    }
    result.push(ok);
  });
  while (next < placed.length) {
    result.push(placed[next++]!.competitor);
  }
  return result;
}
