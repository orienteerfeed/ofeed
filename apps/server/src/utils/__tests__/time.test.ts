import { describe, expect, it } from 'vitest';

import { parseIofDateTime } from '../time.js';

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
