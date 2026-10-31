import type { EventEntryTimeline } from '@repo/shared';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildEntryTimeline,
  entryTimelineClasses,
  summarizeEntryTimeline,
} from '@/pages/Event/Insights/entry-timeline.utils';

const timeline = (
  overrides: Partial<EventEntryTimeline> = {}
): EventEntryTimeline => ({
  timezone: 'Europe/Prague',
  entriesOpenOn: '2026-03-01',
  entriesCloseOn: '2026-03-05',
  eventOn: '2026-03-08',
  days: [
    {
      date: '2026-03-02',
      classId: 2,
      className: 'H21',
      entries: 2,
      lateEntries: 0,
    },
    {
      date: '2026-03-02',
      classId: 1,
      className: 'D21',
      entries: 1,
      lateEntries: 0,
    },
    {
      date: '2026-03-04',
      classId: 1,
      className: 'D21',
      entries: 3,
      lateEntries: 0,
    },
    {
      date: '2026-03-05',
      classId: 2,
      className: 'H21',
      entries: 4,
      lateEntries: 0,
    },
    {
      date: '2026-03-06',
      classId: 1,
      className: 'D21',
      entries: 1,
      lateEntries: 1,
    },
  ],
  ...overrides,
});

describe('entry timeline', () => {
  it('adds calendar days across month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lists classes by name', () => {
    expect(entryTimelineClasses(timeline())).toEqual([
      [1, 'D21'],
      [2, 'H21'],
    ]);
  });

  it('fills every day from opening to the race with a running total', () => {
    const points = buildEntryTimeline(timeline(), '', '2026-03-20');
    expect(
      points.map(point => [point.date, point.entries, point.total])
    ).toEqual([
      ['2026-03-01', 0, 0],
      ['2026-03-02', 3, 3],
      ['2026-03-03', 0, 3],
      ['2026-03-04', 3, 6],
      ['2026-03-05', 4, 10],
      ['2026-03-06', 1, 11],
      ['2026-03-07', 0, 11],
      ['2026-03-08', 0, 11],
    ]);
  });

  it('filters by class and stops at today before the race', () => {
    const points = buildEntryTimeline(timeline(), '1', '2026-03-07');
    expect(points.map(point => [point.date, point.total])).toEqual([
      ['2026-03-01', 0],
      ['2026-03-02', 1],
      ['2026-03-03', 1],
      ['2026-03-04', 4],
      ['2026-03-05', 4],
      ['2026-03-06', 5],
      ['2026-03-07', 5],
    ]);
  });

  it('starts at the first entry when the opening date is unknown', () => {
    const points = buildEntryTimeline(
      timeline({ entriesOpenOn: null }),
      '',
      '2026-03-20'
    );
    expect(points[0]?.date).toBe('2026-03-02');
    expect(
      buildEntryTimeline(
        timeline({ entriesOpenOn: null, days: [] }),
        '',
        '2026-03-20'
      )
    ).toEqual([]);
  });

  it.each(['2026-03-07', '2026-03-20'])(
    'excludes rows beyond the cutoff when today is %s',
    today => {
      const source = timeline();
      const cutoff = today < source.eventOn ? today : source.eventOn;
      const points = buildEntryTimeline(
        timeline({
          days: [
            ...source.days,
            {
              date: cutoff,
              classId: 1,
              className: 'D21',
              entries: 2,
              lateEntries: 2,
            },
            {
              date: addDays(cutoff, 1),
              classId: 1,
              className: 'D21',
              entries: 100,
              lateEntries: 100,
            },
          ],
        }),
        '',
        today
      );

      expect(points.at(-1)).toEqual({
        date: cutoff,
        entries: 2,
        lateEntries: 2,
        total: 13,
      });
      expect(points.every(point => point.date <= cutoff)).toBe(true);
      expect(summarizeEntryTimeline(points, source.entriesCloseOn)).toEqual({
        total: 13,
        lateEntries: 3,
        finalDaysShare: 0.7,
        peak: { date: '2026-03-05', entries: 4 },
      });
    }
  );

  it('returns no points when the opening is unknown and all entries are beyond the cutoff', () => {
    expect(
      buildEntryTimeline(timeline({ entriesOpenOn: null }), '', '2026-02-28')
    ).toEqual([]);
  });

  it('summarizes totals, late entries, the final-days share and the peak day', () => {
    const points = buildEntryTimeline(timeline(), '', '2026-03-20');
    // On-time entries: 10; in the last 3 days up to the deadline (3–5 March): 7.
    expect(summarizeEntryTimeline(points, '2026-03-05')).toEqual({
      total: 11,
      lateEntries: 1,
      finalDaysShare: 0.7,
      peak: { date: '2026-03-05', entries: 4 },
    });
    expect(summarizeEntryTimeline(points, null).finalDaysShare).toBeNull();
    expect(summarizeEntryTimeline([], '2026-03-05')).toEqual({
      total: 0,
      lateEntries: 0,
      finalDaysShare: null,
      peak: null,
    });
  });
});
