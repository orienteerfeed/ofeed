type SplitLike = {
  controlCode: string;
  time: number;
};

type CompetitorLike = {
  id: string;
  time?: number;
  splits: SplitLike[];
};

export const DEFAULT_VISIBLE_SPLIT_CHART_RUNNERS = 3;

export type SplitChartCheckpoint = {
  controlCode: string;
  key: string;
  kind: 'start' | 'control' | 'finish';
  legIndex?: number;
  splitIndex?: number;
};

function hasNumericTime(value: number | undefined): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function getCheckpointTime(
  competitor: CompetitorLike,
  checkpoint: SplitChartCheckpoint,
): number | null {
  if (checkpoint.kind === 'start') {
    return 0;
  }

  if (checkpoint.kind === 'finish') {
    return hasNumericTime(competitor.time) ? competitor.time : null;
  }

  if (typeof checkpoint.splitIndex !== 'number') {
    return null;
  }

  const splitTime = competitor.splits[checkpoint.splitIndex]?.time;
  return hasNumericTime(splitTime) ? splitTime : null;
}

function getCheckpointLegTime(
  competitor: CompetitorLike,
  checkpoint: SplitChartCheckpoint,
): number | null {
  if (checkpoint.kind === 'start') {
    return 0;
  }

  const currentTime = getCheckpointTime(competitor, checkpoint);
  if (currentTime === null) {
    return null;
  }

  if (checkpoint.kind === 'finish') {
    const previousSplitTime =
      competitor.splits.length > 0
        ? competitor.splits[competitor.splits.length - 1]?.time
        : 0;

    return hasNumericTime(previousSplitTime)
      ? currentTime - previousSplitTime
      : null;
  }

  if (typeof checkpoint.splitIndex !== 'number') {
    return null;
  }

  const previousSplitTime =
    checkpoint.splitIndex === 0
      ? 0
      : competitor.splits[checkpoint.splitIndex - 1]?.time;

  return hasNumericTime(previousSplitTime)
    ? currentTime - previousSplitTime
    : null;
}

export function hasSplitChartData(competitor: CompetitorLike): boolean {
  return (
    competitor.splits.some(split => hasNumericTime(split.time)) ||
    hasNumericTime(competitor.time)
  );
}

export function createSplitChartCheckpoints(
  competitors: readonly CompetitorLike[],
): SplitChartCheckpoint[] {
  if (!competitors.some(hasSplitChartData)) {
    return [];
  }

  const splitSource = competitors.reduce<CompetitorLike | null>((longest, competitor) => {
    if (longest === null || competitor.splits.length > longest.splits.length) {
      return competitor;
    }

    return longest;
  }, null);

  const checkpoints: SplitChartCheckpoint[] = [
    {
      controlCode: 'START',
      key: 'start',
      kind: 'start',
    },
  ];

  splitSource?.splits.forEach((split, splitIndex) => {
    checkpoints.push({
      controlCode: split.controlCode,
      key: `control-${splitIndex}-${split.controlCode}`,
      kind: 'control',
      legIndex: splitIndex + 1,
      splitIndex,
    });
  });

  if (competitors.some(competitor => hasNumericTime(competitor.time))) {
    checkpoints.push({
      controlCode: 'FINISH',
      key: 'finish',
      kind: 'finish',
    });
  }

  return checkpoints;
}

export type SplitCourseDistances = {
  totalLength: number;
  controls: ReadonlyArray<{ controlCode: string; distance: number }>;
};

/**
 * Cumulative course distance (metres from the start) for every checkpoint, so the
 * chart can space legs by real distance. Returns null whenever the uploaded course
 * does not line up with the recorded splits or the distances are not strictly
 * increasing — the chart then keeps its evenly-spaced axis.
 *
 * Splits usually cover only a subset of the course (radio controls), and a control
 * code can repeat on a course, so checkpoints are matched by walking the course
 * forward from the previously matched control rather than pairing index by index.
 */
export function createSplitChartDistances(
  checkpoints: readonly SplitChartCheckpoint[],
  courseDistances: SplitCourseDistances | null | undefined,
): number[] | null {
  if (!courseDistances || checkpoints.length === 0) {
    return null;
  }

  const courseControls = courseDistances.controls;
  const distanceByKey = new Map<string, number>();
  let cursor = 0;

  for (const checkpoint of checkpoints) {
    if (checkpoint.kind !== 'control') continue;

    const matchIndex = courseControls.findIndex(
      (control, index) =>
        index >= cursor && String(control.controlCode) === String(checkpoint.controlCode),
    );
    if (matchIndex === -1) {
      return null;
    }

    distanceByKey.set(checkpoint.key, courseControls[matchIndex]!.distance);
    cursor = matchIndex + 1;
  }

  const distances = checkpoints.map(checkpoint => {
    if (checkpoint.kind === 'start') return 0;
    if (checkpoint.kind === 'finish') return courseDistances.totalLength;
    return distanceByKey.get(checkpoint.key) ?? Number.NaN;
  });

  const isStrictlyIncreasing = distances.every(
    (distance, index) =>
      Number.isFinite(distance) && (index === 0 || distance > (distances[index - 1] as number)),
  );

  return isStrictlyIncreasing ? distances : null;
}

export function createFastestSplitChartReferenceTimes(
  checkpoints: readonly SplitChartCheckpoint[],
  competitors: readonly CompetitorLike[],
): Array<number | null> {
  let cumulativeReference = 0;

  return checkpoints.map(checkpoint => {
    if (checkpoint.kind === 'start') {
      return 0;
    }

    const fastestLegTime = competitors.reduce<number | null>((best, competitor) => {
      const legTime = getCheckpointLegTime(competitor, checkpoint);

      if (legTime === null) {
        return best;
      }

      if (best === null || legTime < best) {
        return legTime;
      }

      return best;
    }, null);

    if (fastestLegTime !== null) {
      cumulativeReference += fastestLegTime;
      return cumulativeReference;
    }

    const fallbackReference = competitors.reduce<number | null>((best, competitor) => {
      const checkpointTime = getCheckpointTime(competitor, checkpoint);

      if (checkpointTime === null) {
        return best;
      }

      if (best === null || checkpointTime < best) {
        return checkpointTime;
      }

      return best;
    }, null);

    if (fallbackReference !== null) {
      cumulativeReference = fallbackReference;
    }

    return fallbackReference;
  });
}

export function createInitialSplitChartVisibility(
  competitors: readonly CompetitorLike[],
  previous: Record<string, boolean> = {},
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  const activeIds = new Set(competitors.map(competitor => competitor.id));
  const preservedIds = Object.keys(previous).filter(id => activeIds.has(id));

  if (preservedIds.length > 0) {
    competitors.forEach(competitor => {
      next[competitor.id] = previous[competitor.id] ?? false;
    });
    return next;
  }

  const defaultVisibleIds = new Set(
    competitors
      .filter(hasSplitChartData)
      .slice(0, DEFAULT_VISIBLE_SPLIT_CHART_RUNNERS)
      .map(competitor => competitor.id),
  );

  competitors.forEach(competitor => {
    next[competitor.id] = defaultVisibleIds.has(competitor.id);
  });

  return next;
}
