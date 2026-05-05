import { render, screen } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import {
  EventCollection,
  EventListEmptyState,
  EventListInitialLoadingState,
  EventListPaginationState,
} from '../../../src/pages/Home/EventListDisplay';
import type { HomeEventListItem } from '../../../src/pages/Home/types';

vi.mock('../../../src/pages/Home/EventCard', () => ({
  EventCard: ({ event }: { event: HomeEventListItem }) => (
    <article data-testid="event-card">{event.name}</article>
  ),
}));

vi.mock('../../../src/pages/Home/EventTableRow', () => ({
  EventTableRow: ({ event }: { event: HomeEventListItem }) => (
    <tr data-testid="event-row">
      <td>{event.name}</td>
    </tr>
  ),
}));

vi.mock('../../../src/pages/Home/EventMapView', () => ({
  EventMapView: ({ events }: { events: HomeEventListItem[] }) => (
    <div data-testid="event-map">
      {events.map(event => event.name).join(',')}
    </div>
  ),
}));

const t = ((key: string) => key) as TFunction;

const event = (id: string, name: string): HomeEventListItem => ({
  discipline: 'SPRINT',
  entriesConfigured: true,
  entriesStatus: 'OPEN',
  id,
  name,
  date: '1. 5. 2026',
  relay: false,
  slug: name.toLowerCase().replaceAll(' ', '-'),
  sport: { id: 1, name: 'Orienteering' },
  status: 'UPCOMING',
});

describe('EventListDisplay', () => {
  it('renders the same event items in card, list, and map modes', () => {
    const events = [event('1', 'City Sprint'), event('2', 'Forest Cup')];

    const { rerender } = render(
      <EventCollection events={events} mapViewEnabled t={t} viewMode="card" />
    );

    expect(screen.getAllByTestId('event-card')).toHaveLength(2);
    expect(screen.getByText('City Sprint')).toBeInTheDocument();
    expect(screen.getByText('Forest Cup')).toBeInTheDocument();

    rerender(
      <EventCollection events={events} mapViewEnabled t={t} viewMode="list" />
    );

    expect(screen.getAllByTestId('event-row')).toHaveLength(2);
    expect(screen.getByText('City Sprint')).toBeInTheDocument();
    expect(screen.getByText('Forest Cup')).toBeInTheDocument();

    rerender(
      <EventCollection events={events} mapViewEnabled t={t} viewMode="map" />
    );

    expect(screen.getByTestId('event-map')).toHaveTextContent(
      'City Sprint,Forest Cup'
    );
  });

  it('renders shared empty, loading, and pagination states', () => {
    const { rerender } = render(<EventListEmptyState t={t} />);

    expect(
      screen.getByText('Pages.Home.Infinite.NoEvents')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pages.Home.Infinite.NoEventsHint')
    ).toBeInTheDocument();

    rerender(<EventListInitialLoadingState showLabel t={t} />);
    expect(
      screen.getByText('Pages.Home.Infinite.LoadingInitial')
    ).toBeInTheDocument();

    rerender(
      <EventListPaginationState
        isLoadingMore
        sentinelRef={() => undefined}
        t={t}
      />
    );
    expect(
      screen.getByText('Pages.Home.Infinite.LoadingMore')
    ).toBeInTheDocument();
  });
});
