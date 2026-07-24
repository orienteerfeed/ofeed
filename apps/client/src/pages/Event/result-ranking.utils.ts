/**
 * Shared tie-aware time ranking and loss-to-leader math, used by every results
 * table (individual, club, relay overall, relay per-leg, splits) so the
 * DSQ/tie/loss semantics stay identical instead of drifting per copy.
 */
import { formatSecondsToTime } from '@/lib/date';

export interface TimedEntry {
  id: string;
  time: number;
}

export interface TimeRanking {
  /** Competition ranking: ties share a rank, the next distinct time resumes
   * at the count of entries seen so far (e.g. 1, 1, 3, 4). */
  rankById: Map<string, number>;
  bestTime: number | undefined;
  secondBestTime: number | undefined;
}

export function rankByTime(entries: readonly TimedEntry[]): TimeRanking {
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  const rankById = new Map<string, number>();

  let pos = 1;
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const prevRank = prev ? rankById.get(prev.id) ?? pos : undefined;
    const rank =
      prev && cur.time === prev.time && prevRank != null ? prevRank : pos;
    rankById.set(cur.id, rank);
    pos++;
  }

  return {
    rankById,
    bestTime: sorted[0]?.time,
    secondBestTime: sorted[1]?.time,
  };
}

/**
 * Time loss relative to the best time: positive when behind the leader, or —
 * for the rank-1 holder, when a runner-up time is known — negative to show
 * their lead margin instead of a bare null. Undefined when there is nothing
 * meaningful to show (no time/best time, or a winner with no runner-up).
 */
export function computeLoss(
  time: number | undefined,
  bestTime: number | undefined,
  options: {
    rank?: number | string | undefined;
    secondBestTime?: number | undefined;
  } = {}
): number | undefined {
  if (time == null || bestTime == null) return undefined;
  if (time > bestTime) return time - bestTime;
  const { rank, secondBestTime } = options;
  if (rank === 1 && secondBestTime != null) return -(secondBestTime - bestTime);
  return undefined;
}

/** A recorded time of zero (or negative) is a data artifact, not a real result. */
export function hasValidRaceTime(
  time: number | null | undefined
): time is number {
  return time != null && time > 0;
}

/** Positive loss renders as "+m:ss" (behind), negative as "-m:ss" (lead margin). */
export function formatSignedLoss(loss: number | undefined): string {
  if (loss == null || loss === 0) return '';
  return loss > 0
    ? `+${formatSecondsToTime(loss)}`
    : `-${formatSecondsToTime(-loss)}`;
}
