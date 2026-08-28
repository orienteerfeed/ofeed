/**
 * Search, ordering and ranking for the cross-category live result feed.
 *
 * The feed holds every competitor of the event that already carries result data,
 * merged from a backfill query and the per-competitor subscription. Ranks are
 * recomputed from the whole feed on every change, so a faster runner arriving
 * later correctly pushes everyone behind them down instead of freezing a snapshot
 * taken at the moment of finishing.
 */
import { formatTimeToHms } from '@/lib/date';
import { computeRelayCumulativeStandings } from './relay-results.utils';
import { hasValidRaceTime, rankByTime } from './result-ranking.utils';

/**
 * Statuses that put a competitor into the feed. Mirrors `RESULT_DATA_STATUSES` in
 * `apps/server/src/modules/event/event.status.service.ts`, which drives the
 * backfill query — the client needs the same set to decide whether an incoming
 * subscription row belongs in the feed.
 *
 * ponytail: 11 duplicated strings; move to @repo/shared if a third consumer needs them.
 */
export const RESULT_DATA_STATUSES: ReadonlySet<string> = new Set([
  'OK',
  'Finished',
  'MissingPunch',
  'Disqualified',
  'DidNotFinish',
  'OverTime',
  'SportingWithdrawal',
  'NotCompeting',
  'Moved',
  'MovedUp',
  'Cancelled',
]);

export interface LiveFeedRow {
  id: number;
  firstname: string;
  lastname: string;
  registration?: string | null;
  organisation?: string | null;
  organisationId?: number | null;
  status: string;
  time?: number | null;
  finishTime?: string | null;
  updatedAt: string;
  leg?: number | null;
  teamId?: number | null;
  class: {
    id: number;
    name: string;
    resultListMode?: string | null;
  };
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase();

/**
 * Substring match across name, club and registration ("KAM9403"). Every token has
 * to hit, so "krivda kam" narrows instead of widening. Diacritics are stripped on
 * both sides, so "krivda" finds "Křivda".
 */
export function matchesLiveFeedQuery(row: LiveFeedRow, query: string): boolean {
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = normalize(
    `${row.firstname} ${row.lastname} ${row.organisation ?? ''} ${row.registration ?? ''}`
  );
  return tokens.every(token => haystack.includes(token));
}

/**
 * Newest finish first, ordering by the exact value the Finish column renders:
 * the `HH:mm:ss` clock time of `finishTime`, falling back to the readout time
 * (`updatedAt`) when the timing software did not send one.
 *
 * Comparing the rendered string rather than the timestamp is deliberate. The two
 * sources rarely share a date — `finishTime` sits on the event day while a
 * fallback `updatedAt` can be whenever the row was last touched — so absolute
 * timestamps would sort a 10:31:20 readout above a 15:06:06 finish, contradicting
 * the column the user is reading. Zero-padded 24h strings compare
 * chronologically, and an unparsable value formats to `''` and lands last.
 *
 * ponytail: clock-time ordering, so a race crossing midnight puts 00:20 below
 * 23:50; switch to event-timezone-anchored timestamps if that ever ships.
 */
export function compareByFinishDesc(a: LiveFeedRow, b: LiveFeedRow): number {
  const at = formatTimeToHms(a.finishTime ?? a.updatedAt);
  const bt = formatTimeToHms(b.finishTime ?? b.updatedAt);
  return bt.localeCompare(at);
}

function groupByClassId(
  rows: readonly LiveFeedRow[]
): Map<number, LiveFeedRow[]> {
  const groups = new Map<number, LiveFeedRow[]>();
  for (const row of rows) {
    const group = groups.get(row.class.id);
    if (group) group.push(row);
    else groups.set(row.class.id, [row]);
  }
  return groups;
}

/**
 * Rank shown next to each competitor, keyed by competitor id:
 *
 * - individual races: placement inside the category by race time
 * - multi-leg disciplines: the team's overall standing after that runner's leg
 *   (cumulative sum of leg times), matching the relay overall table rather than
 *   the runner's placement on their own leg
 *
 * `isRelay` comes from `event.relay`, which the server derives from the event
 * discipline (RELAY / SPRINT_RELAY / TEAMS). Competitors with no rank — non-OK
 * status, no valid time, or a team whose earlier leg has not been read out yet —
 * are simply absent from the map and heal on the next recompute.
 *
 * The relay branch deliberately uses the per-leg ranking rather than the relay
 * table's `brokenTeamIds` filter. That filter voids a team's *final* standing and
 * requires every leg up to `maxLeg`, so mid-race — when later legs are still out
 * on the course — it would leave virtually every row unranked. The per-leg
 * ranking already compares only the teams that completed the legs up to that
 * point, which is exactly the standing at the moment of the handover.
 */
export function rankFeedRows(
  rows: readonly LiveFeedRow[],
  isRelay: boolean
): Map<number, number> {
  const ranks = new Map<number, number>();

  for (const group of groupByClassId(rows).values()) {
    if (!isRelay) {
      const entries = group
        .filter(row => row.status === 'OK' && hasValidRaceTime(row.time))
        .map(row => ({ id: String(row.id), time: row.time as number }));

      for (const [id, rank] of rankByTime(entries).rankById) {
        ranks.set(Number(id), rank);
      }
      continue;
    }

    // `maxLeg` only bounds the leg walk; the discipline already decided the branch.
    // It is derived from the feed, so it covers exactly the legs that have results.
    const maxLeg = group.reduce((max, row) => Math.max(max, row.leg ?? 0), 0);
    if (maxLeg === 0) continue;

    const { rankingByLeg } = computeRelayCumulativeStandings(
      group.map(row => ({
        leg: row.leg ?? undefined,
        teamId: row.teamId ?? undefined,
        status: row.status,
        time: row.time ?? undefined,
      })),
      maxLeg
    );

    for (const row of group) {
      if (row.teamId == null || row.leg == null) continue;
      const rank = rankingByLeg.get(row.leg)?.rankById.get(String(row.teamId));
      if (rank != null) ranks.set(row.id, rank);
    }
  }

  return ranks;
}
