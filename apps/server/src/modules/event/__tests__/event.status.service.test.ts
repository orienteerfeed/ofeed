import { describe, expect, it } from 'vitest';

import { buildOfficialResultsUrl, computeEventStatusSummary } from '../event.status.service.js';

describe('event.status.service', () => {
  it('keeps same-day events upcoming until zero time in the event timezone', () => {
    const beforeStart = computeEventStatusSummary({
      published: true,
      date: new Date('2026-04-12T08:00:00.000Z'),
      timezone: 'Europe/Prague',
      hasResultData: false,
      now: new Date('2026-04-12T07:59:00.000Z'),
    });

    const atStart = computeEventStatusSummary({
      published: true,
      date: new Date('2026-04-12T08:00:00.000Z'),
      timezone: 'Europe/Prague',
      hasResultData: false,
      now: new Date('2026-04-12T08:00:00.000Z'),
    });

    expect(beforeStart.lifecycle).toBe('UPCOMING');
    expect(beforeStart.primary).toBe('UPCOMING');
    expect(atStart.lifecycle).toBe('LIVE');
    expect(atStart.primary).toBe('LIVE');
  });

  it('marks finished events with uploaded local results as unofficial until confirmed', () => {
    const summary = computeEventStatusSummary({
      published: true,
      date: new Date('2026-04-05T00:00:00.000Z'),
      timezone: 'Europe/Prague',
      hasResultData: true,
      now: new Date('2026-04-08T10:00:00.000Z'),
    });

    expect(summary.lifecycle).toBe('DONE');
    expect(summary.primary).toBe('DONE');
    expect(summary.results).toBe('UNOFFICIAL');
    expect(summary.entries).toBe('CLOSED');
  });

  it('treats local manual confirmation as official without external URL', () => {
    const officialAt = new Date('2026-04-08T09:15:00.000Z');
    const summary = computeEventStatusSummary({
      published: true,
      date: new Date('2026-04-05T00:00:00.000Z'),
      timezone: 'Europe/Prague',
      hasResultData: true,
      resultsOfficialManuallySetAt: officialAt,
      now: new Date('2026-04-08T10:00:00.000Z'),
    });

    expect(summary.results).toBe('OFFICIAL');
    expect(summary.officialResultsSource).toBe('LOCAL');
    expect(summary.officialResultsUrl).toBeNull();
    expect(summary.resultsOfficialAt).toEqual(officialAt);
  });

  it('shows the primary status as done when final results are available', () => {
    const summary = computeEventStatusSummary({
      published: true,
      date: new Date('2026-04-12T10:00:00.000Z'),
      timezone: 'Europe/Prague',
      hasResultData: true,
      resultsOfficialAt: new Date('2026-04-12T08:30:00.000Z'),
      now: new Date('2026-04-12T08:35:00.000Z'),
    });

    expect(summary.lifecycle).toBe('UPCOMING');
    expect(summary.results).toBe('OFFICIAL');
    expect(summary.primary).toBe('DONE');
  });

  it('opens entries only inside the configured window', () => {
    const summary = computeEventStatusSummary({
      published: true,
      date: new Date('2026-04-12T00:00:00.000Z'),
      timezone: 'Europe/Prague',
      entriesOpenAt: new Date('2026-04-01T08:00:00.000Z'),
      entriesCloseAt: new Date('2026-04-10T18:00:00.000Z'),
      hasResultData: false,
      now: new Date('2026-04-08T10:00:00.000Z'),
    });

    expect(summary.entriesConfigured).toBe(true);
    expect(summary.entries).toBe('OPEN');
    expect(summary.primary).toBe('UPCOMING');
  });

  it('builds official ORIS and Eventor result URLs', () => {
    expect(buildOfficialResultsUrl('ORIS', '9666')).toBe(
      'https://oris.ceskyorientak.cz/Vysledky?id=9666',
    );
    expect(buildOfficialResultsUrl('EVENTOR', '8726')).toBe(
      'https://eventor.orienteering.sport/Events/ResultList?eventId=8726&groupBy=EventClass',
    );
  });
});
