import { describe, expect, it } from 'vitest';
import { formatTimeToHms } from '../../../src/lib/date';
import {
  convertGraphQLEventToHomeEvent,
  type GraphQLEvent,
} from '../../../src/pages/Home/eventsGql';

const event = (overrides: Partial<GraphQLEvent> = {}): GraphQLEvent => ({
  id: 'event-1',
  name: 'City Sprint',
  date: '2026-06-15T08:00:00.000Z',
  timezone: 'Europe/Prague',
  zeroTime: '08:00:00',
  sport: { id: 1, name: 'Orienteering' },
  discipline: 'SPRINT',
  relay: false,
  statusSummary: {
    primary: 'UPCOMING',
    entries: 'OPEN',
    entriesConfigured: true,
  },
  ...overrides,
});

describe('convertGraphQLEventToHomeEvent', () => {
  it.each([
    ['2026-06-15T08:00:00.000Z', '08:00:00', 'Europe/Prague', '10:00:00'],
    ['2026-12-15T09:00:00.000Z', '09:00:00', 'Europe/Prague', '10:00:00'],
    ['2026-06-15T08:00:00.000Z', '08:00:00', 'America/New_York', '04:00:00'],
    ['2026-06-15T08:00:00.000Z', '08:00:00', 'UTC', '08:00:00'],
    ['2026-06-15T22:30:00.000Z', '22:30:00', 'Europe/Prague', '00:30:00'],
    ['2026-06-15T00:00:00.000Z', '00:00:00', 'Europe/Prague', '02:00:00'],
  ])(
    'converts UTC zero time on %s from %s to %s local time %s',
    (date, zeroTime, timezone, expected) => {
      const result = convertGraphQLEventToHomeEvent(
        event({ date, zeroTime, timezone })
      );

      expect(result.zeroTime).toBe(expected);
    }
  );

  it('preserves nonzero seconds when formatting the local start time', () => {
    const result = convertGraphQLEventToHomeEvent(
      event({ date: '2026-06-15T08:00:30.000Z', zeroTime: '08:00:30' })
    );

    expect(result.zeroTime).toBe('10:00:30');
    expect(formatTimeToHms(result.zeroTime!, { dropZeroSeconds: true })).toBe(
      '10:00:30'
    );
  });

  it('drops zero seconds without changing the converted local time', () => {
    const result = convertGraphQLEventToHomeEvent(event());

    expect(formatTimeToHms(result.zeroTime!, { dropZeroSeconds: true })).toBe(
      '10:00'
    );
  });

  it.each([null, ''])(
    'omits the start time when the API returns %s',
    zeroTime => {
      expect(
        convertGraphQLEventToHomeEvent(event({ zeroTime }))
      ).not.toHaveProperty('zeroTime');
    }
  );

  it('omits the start time when the API does not provide it', () => {
    const source = event();
    delete source.zeroTime;

    expect(convertGraphQLEventToHomeEvent(source)).not.toHaveProperty(
      'zeroTime'
    );
  });
});
