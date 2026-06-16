/**
 * Result list display modes configured per class (`Class.resultListMode`).
 *
 * - `Default`  - sort by result status and race time; show final time and time loss.
 * - `Unordered` - sort alphabetically (finished competitors still first);
 *                 keep final time and time loss visible.
 * - `UnorderedNoTimes` - sort alphabetically (finished competitors still first);
 *                 hide final time and time loss.
 */
export type ResultListMode = 'Default' | 'Unordered' | 'UnorderedNoTimes';

const UNORDERED_MODES: ReadonlySet<ResultListMode> = new Set([
  'Unordered',
  'UnorderedNoTimes',
]);

/** Normalize the raw `resultListMode` string into a known mode, defaulting to `Default`. */
export function resolveResultListMode(mode?: string | null): ResultListMode {
  if (mode === 'Unordered' || mode === 'UnorderedNoTimes') {
    return mode;
  }
  return 'Default';
}

/** Whether competitors should be ordered alphabetically instead of by race time. */
export function isUnorderedResultListMode(mode?: string | null): boolean {
  return UNORDERED_MODES.has(resolveResultListMode(mode));
}

/** Whether the final time column should be displayed. */
export function shouldDisplayResultTimes(mode?: string | null): boolean {
  return resolveResultListMode(mode) !== 'UnorderedNoTimes';
}

/** Whether the time-loss (diff) column should be displayed. */
export function shouldDisplayResultTimeLoss(mode?: string | null): boolean {
  return resolveResultListMode(mode) !== 'UnorderedNoTimes';
}

/**
 * Ordering of result statuses, shared by the default and unordered modes so the
 * grouping stays consistent: ranked finishers first, then runners on the course,
 * those waiting for a result, and finally the various non-classified statuses.
 */
export const RESULT_STATUS_PRIORITY: Readonly<Record<string, number>> = {
  OK: 0,
  Active: 1,
  Finished: 2,
  Inactive: 3,
  NotCompeting: 4,
  OverTime: 5,
  Disqualified: 6,
  MissingPunch: 7,
  DidNotFinish: 8,
  DidNotStart: 9,
};

/** Priority of a result status; unknown statuses sort after every known one. */
export function getResultStatusPriority(status: string): number {
  return RESULT_STATUS_PRIORITY[status] ?? 10;
}

/**
 * A competitor counts as "finished" once they hold a final, ranked result (`OK`).
 * Everyone else (running, waiting for readout, not started, DNF/DSQ/...) is grouped
 * after finished competitors in the unordered modes.
 */
export function isFinishedResultCompetitor(competitor: {
  status: string;
}): boolean {
  return competitor.status === 'OK';
}

type NamedCompetitor = {
  firstname?: string | null;
  lastname?: string | null;
};

/** Alphabetical comparator: by lastname, then firstname, locale-aware and case-insensitive. */
export function compareCompetitorsByName(
  a: NamedCompetitor,
  b: NamedCompetitor,
): number {
  const lastName = (a.lastname ?? '').localeCompare(b.lastname ?? '', undefined, {
    sensitivity: 'base',
  });
  if (lastName !== 0) {
    return lastName;
  }
  return (a.firstname ?? '').localeCompare(b.firstname ?? '', undefined, {
    sensitivity: 'base',
  });
}

/**
 * Comparator for the unordered modes: keep the status-priority grouping (ranked
 * finishers first, then running / waiting / not-started / non-classified), and
 * sort alphabetically within each status group instead of by race time.
 */
export function compareByStatusPriorityThenName(
  a: NamedCompetitor & { status: string },
  b: NamedCompetitor & { status: string },
): number {
  const priority = getResultStatusPriority(a.status) - getResultStatusPriority(b.status);
  if (priority !== 0) {
    return priority;
  }
  return compareCompetitorsByName(a, b);
}

/**
 * Format the rank cell for display. Numeric ranks become "3." in default mode but
 * are hidden ("-") in the unordered modes, where the list is intentionally not a
 * time ranking. Non-numeric status markers (emoji) pass through unchanged.
 */
export function formatResultListRank(
  position: number | string | undefined | null,
  mode?: string | null,
): string {
  if (position === undefined || position === null) {
    return '';
  }
  if (typeof position === 'number') {
    return isUnorderedResultListMode(mode) ? '-' : `${position}.`;
  }
  return position;
}
