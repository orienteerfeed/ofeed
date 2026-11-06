import type { EventEntryTimeline } from '@repo/shared';

export interface EntryTimelinePoint {
  date: string;
  entries: number;
  lateEntries: number;
  total: number;
}

export interface EntryTimelineSummary {
  total: number;
  lateEntries: number;
  /** Share of on-time entries made in the last 3 days up to the deadline. */
  finalDaysShare: number | null;
  peak: { date: string; entries: number } | null;
}

const FINAL_DAYS = 3;
// Guards against a corrupt window (e.g. year typo) rendering thousands of days.
const MAX_DAYS = 3660;

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function entryTimelineClasses(
  timeline: EventEntryTimeline
): [number, string][] {
  const classes = new Map(
    timeline.days.map(day => [day.classId, day.className])
  );
  return [...classes].sort(([, a], [, b]) => a.localeCompare(b));
}

/**
 * One point per calendar day from the opening (or first entry) to the race day,
 * cut at today, with the running total. Days without entries are kept so the
 * axis is linear in time.
 */
export function buildEntryTimeline(
  timeline: EventEntryTimeline,
  classId: string,
  today: string
): EntryTimelinePoint[] {
  const until = timeline.eventOn < today ? timeline.eventOn : today;
  const perDay = new Map<string, { entries: number; lateEntries: number }>();
  for (const day of timeline.days) {
    if (day.date > until) continue;
    if (classId && String(day.classId) !== classId) continue;
    const current = perDay.get(day.date) ?? { entries: 0, lateEntries: 0 };
    current.entries += day.entries;
    current.lateEntries += day.lateEntries;
    perDay.set(day.date, current);
  }
  const dates = [...perDay.keys()].sort();
  const first = [timeline.entriesOpenOn, dates[0]]
    .filter((date): date is string => !!date)
    .sort()[0];
  if (!first) return [];

  const points: EntryTimelinePoint[] = [];
  let total = 0;
  for (
    let date = first;
    date <= until && points.length < MAX_DAYS;
    date = addDays(date, 1)
  ) {
    const day = perDay.get(date) ?? { entries: 0, lateEntries: 0 };
    total += day.entries;
    points.push({ date, ...day, total });
  }
  return points;
}

export function summarizeEntryTimeline(
  points: EntryTimelinePoint[],
  entriesCloseOn: string | null
): EntryTimelineSummary {
  const total = points.at(-1)?.total ?? 0;
  const lateEntries = points.reduce((sum, point) => sum + point.lateEntries, 0);
  const peakPoint = points.reduce<EntryTimelinePoint | null>(
    (best, point) =>
      point.entries > 0 && (!best || point.entries > best.entries)
        ? point
        : best,
    null
  );
  let finalDaysShare: number | null = null;
  if (entriesCloseOn) {
    const from = addDays(entriesCloseOn, -(FINAL_DAYS - 1));
    const onTime = total - lateEntries;
    const final = points
      .filter(point => point.date >= from && point.date <= entriesCloseOn)
      .reduce((sum, point) => sum + point.entries - point.lateEntries, 0);
    finalDaysShare = onTime > 0 ? final / onTime : null;
  }
  return {
    total,
    lateEntries,
    finalDaysShare,
    peak: peakPoint
      ? { date: peakPoint.date, entries: peakPoint.entries }
      : null,
  };
}
