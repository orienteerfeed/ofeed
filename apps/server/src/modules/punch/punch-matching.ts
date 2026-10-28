export type CardCandidate = {
  id: number;
  startTime: Date | null;
  finishTime: Date | null;
};

/** Ambiguous cards require one fully bounded window; do not guess by list order. */
export function matchPunch(time: Date, candidates: CardCandidate[]): number | null {
  if (candidates.length === 1) return candidates[0].id;
  const instant = time.getTime();
  const matches = candidates.filter((candidate) => {
    if (!candidate.startTime || instant < candidate.startTime.getTime()) return false;
    if (
      candidates.some(
        (other) =>
          other.id !== candidate.id &&
          other.startTime?.getTime() === candidate.startTime?.getTime(),
      )
    )
      return false;
    if (candidate.finishTime) return instant <= candidate.finishTime.getTime();
    const nextStarts = candidates.flatMap((other) =>
      other.startTime && other.startTime > candidate.startTime! ? [other.startTime.getTime()] : [],
    );
    return nextStarts.length > 0 && instant < Math.min(...nextStarts);
  });
  return matches.length === 1 ? matches[0].id : null;
}

export function elapsedSeconds(time: Date, start: Date | null): number | null {
  if (!start || time < start) return null;
  return Math.floor((time.getTime() - start.getTime()) / 1000);
}
