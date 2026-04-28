import { describe, expect, it } from 'vitest';

import {
  combineEventDateWithZeroTime,
  formatUtcDateTimeRfc3339,
  parseIofDateTime,
} from '../time.js';

describe('parseIofDateTime', () => {
  it('parses local IOF datetime in the event timezone and converts it to UTC', () => {
    expect(parseIofDateTime('2025-11-14T19:43:00', 'Europe/Prague')?.toISOString()).toBe(
      '2025-11-14T18:43:00.000Z',
    );
  });

  it('preserves explicit Z timestamps as UTC instants', () => {
    expect(parseIofDateTime('2025-10-11T10:20:00Z', 'Europe/Prague')?.toISOString()).toBe(
      '2025-10-11T10:20:00.000Z',
    );
  });

  it('preserves timestamps with explicit timezone offsets', () => {
    expect(parseIofDateTime('2026-03-21T13:30:00+01:00', 'Europe/Prague')?.toISOString()).toBe(
      '2026-03-21T12:30:00.000Z',
    );
    expect(parseIofDateTime('2026-02-01T10:06:00+02:00', 'Europe/Prague')?.toISOString()).toBe(
      '2026-02-01T08:06:00.000Z',
    );
  });

  it('returns undefined for invalid datetime values', () => {
    expect(parseIofDateTime('not-a-date', 'Europe/Prague')).toBeUndefined();
    expect(parseIofDateTime('', 'Europe/Prague')).toBeUndefined();
  });
});

describe('combineEventDateWithZeroTime', () => {
  it('preserves the provided calendar day even when the input datetime carries an offset', () => {
    expect(combineEventDateWithZeroTime('2026-04-26T00:00:00+02:00', '10:15')?.toISOString()).toBe(
      '2026-04-26T10:15:00.000Z',
    );
  });

  it('returns undefined for invalid inputs', () => {
    expect(combineEventDateWithZeroTime('not-a-date', '10:15')).toBeUndefined();
    expect(combineEventDateWithZeroTime('2026-04-26T00:00:00Z', '25:15')).toBeUndefined();
  });
});

describe('formatUtcDateTimeRfc3339', () => {
  it('serializes UTC datetimes without milliseconds', () => {
    expect(formatUtcDateTimeRfc3339(new Date('2026-04-26T10:15:00.000Z'))).toBe(
      '2026-04-26T10:15:00Z',
    );
  });
});
