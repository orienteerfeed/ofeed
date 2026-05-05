import { describe, expect, it } from 'vitest';
import {
  appendUniqueEvents,
  getEventLocationLabel,
  getEventStatusClassName,
  mapFilterToGraphQL,
  mergeUniqueEvents,
} from '../../../src/pages/Home/eventListUtils';
import type { HomeEventListItem } from '../../../src/pages/Home/types';

const event = (overrides: Partial<HomeEventListItem>): HomeEventListItem => ({
  discipline: 'SPRINT',
  entriesConfigured: true,
  entriesStatus: 'OPEN',
  id: 'event-1',
  name: 'City Sprint',
  date: '1. 5. 2026',
  relay: false,
  slug: 'city-sprint',
  sport: { id: 1, name: 'Orienteering' },
  status: 'UPCOMING',
  ...overrides,
});

describe('eventListUtils', () => {
  it('maps home filters to GraphQL filters', () => {
    expect(mapFilterToGraphQL('ongoing')).toBe('TODAY');
    expect(mapFilterToGraphQL('upcoming')).toBe('UPCOMING');
    expect(mapFilterToGraphQL('recent')).toBe('RECENT');
    expect(mapFilterToGraphQL('all')).toBeNull();
  });

  it('keeps first event occurrence when merging duplicate event lists', () => {
    const first = event({ id: '1', name: 'First' });
    const duplicate = event({ id: '1', name: 'Duplicate' });
    const second = event({ id: '2', name: 'Second' });

    expect(mergeUniqueEvents([first, duplicate, second])).toEqual([
      first,
      second,
    ]);
  });

  it('appends only events that are not already loaded', () => {
    const first = event({ id: '1', name: 'First' });
    const duplicate = event({ id: '1', name: 'Duplicate' });
    const second = event({ id: '2', name: 'Second' });

    expect(appendUniqueEvents([first], [duplicate, second])).toEqual([
      first,
      second,
    ]);
  });

  it('formats shared location and status display values', () => {
    expect(
      getEventLocationLabel(
        event({
          country: { countryCode: 'CZ', countryName: 'Czechia' },
          location: 'Prague',
        })
      )
    ).toBe('Prague, Czechia');
    expect(getEventLocationLabel(event({}))).toBe('—');
    expect(getEventStatusClassName('LIVE')).toBe(
      'bg-primary text-primary-foreground'
    );
  });
});
