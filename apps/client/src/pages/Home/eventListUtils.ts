import type { EventFilter } from '@/types/event';
import { convertGraphQLEventToHomeEvent, type EventsData } from './eventsGql';
import type { HomeEventListItem } from './types';

export type EventListViewMode = 'card' | 'list' | 'map';

export const VIEW_MODE_KEY = 'homeEventsViewMode';
export const DEFAULT_VIEW_MODE: Exclude<EventListViewMode, 'map'> = 'card';

export function isEventListViewMode(
  value: string | null
): value is EventListViewMode {
  return value === 'card' || value === 'list' || value === 'map';
}

export function resolveInitialViewMode(
  mapViewEnabled: boolean
): EventListViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);

    if (isEventListViewMode(stored)) {
      if (!mapViewEnabled && stored === 'map') {
        return DEFAULT_VIEW_MODE;
      }

      return stored;
    }
  } catch {
    // ignore storage errors
  }

  return DEFAULT_VIEW_MODE;
}

export function mapFilterToGraphQL(filter: EventFilter): string | null {
  switch (filter) {
    case 'ongoing':
      return 'TODAY';
    case 'upcoming':
      return 'UPCOMING';
    case 'recent':
      return 'RECENT';
    case 'all':
    default:
      return null;
  }
}

export function mapGraphQLEventsToHomeEvents(
  events: EventsData['events'] | undefined
): HomeEventListItem[] {
  return (
    events?.edges.map(edge => convertGraphQLEventToHomeEvent(edge.node)) ?? []
  );
}

export function mergeUniqueEvents(
  events: readonly HomeEventListItem[]
): HomeEventListItem[] {
  return events.filter(
    (event, index, self) =>
      self.findIndex(entry => entry.id === event.id) === index
  );
}

export function appendUniqueEvents(
  currentEvents: HomeEventListItem[],
  nextEvents: readonly HomeEventListItem[]
): HomeEventListItem[] {
  const existingIds = new Set(currentEvents.map(event => event.id));
  const uniqueNextEvents = nextEvents.filter(
    event => !existingIds.has(event.id)
  );

  return uniqueNextEvents.length === 0
    ? currentEvents
    : [...currentEvents, ...uniqueNextEvents];
}

export function formatZeroTime(zeroTime: string): string {
  return zeroTime.endsWith(':00') ? zeroTime.slice(0, -3) : zeroTime;
}

export function getEventLocationLabel(event: HomeEventListItem): string {
  return (
    [event.location, event.country?.countryName].filter(Boolean).join(', ') ||
    '—'
  );
}

export function getEventStatusClassName(
  status: HomeEventListItem['status']
): string {
  switch (status) {
    case 'LIVE':
      return 'bg-primary text-primary-foreground';
    case 'UPCOMING':
      return 'bg-secondary text-secondary-foreground';
    case 'DONE':
    case 'DRAFT':
      return 'bg-muted text-muted-foreground';
  }
}
