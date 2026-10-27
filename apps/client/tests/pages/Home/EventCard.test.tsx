import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventCard } from '../../../src/pages/Home/EventCard';
import { EventInfoView } from '../../../src/pages/Event/EventInfoView';
import type { HomeEventListItem } from '../../../src/pages/Home/types';
import type { Event } from '../../../src/types/event';

vi.mock('i18next', () => ({ t: (key: string) => key }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'cs' } }),
}));
vi.mock('../../../src/components/atoms', async () => ({
  ...(await import('../../../src/components/atoms/Button')),
  CountryFlag: () => null,
}));
vi.mock('../../../src/components/organisms', () => ({ Alert: () => null }));
vi.mock('../../../src/pages/Event/Entries', () => ({
  EventEntriesView: () => <div>Entry form</div>,
}));

const event: HomeEventListItem = {
  id: 'test-event',
  slug: 'test-event',
  name: 'Test event',
  date: '2026-10-27',
  discipline: 'SPRINT',
  sport: { id: 1, name: 'Orienteering' },
  relay: false,
  status: 'UPCOMING',
  entriesConfigured: true,
  entriesStatus: 'OPEN',
};
const detail: Event = {
  ...event,
  status: 'upcoming',
  organizer: 'Club',
  location: 'Prague',
  country: { countryCode: 'CZ', countryName: 'Czechia' },
  sportId: 1,
  ranking: false,
  createdAt: '2026-10-27',
  updatedAt: '2026-10-27',
  published: true,
  authorId: 1,
  user: null,
  statusSummary: {
    primary: 'UPCOMING',
    lifecycle: 'UPCOMING',
    results: 'NONE',
    entries: 'OPEN',
    entriesConfigured: true,
  },
};

function mountCard(overrides: Partial<HomeEventListItem> = {}) {
  const root = createRootRoute();
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <EventCard event={{ ...event, ...overrides }} />,
  });
  function DelayedDetail() {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      const timer = setTimeout(() => setLoaded(true), 30);
      return () => clearTimeout(timer);
    }, []);
    return loaded ? <EventInfoView event={detail} /> : <p>Loading event</p>;
  }
  const eventRoute = createRoute({
    getParentRoute: () => root,
    path: '/events/$eventId',
    component: DelayedDetail,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, eventRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.unstubAllGlobals());

describe('EventCard entry action', () => {
  it('opens event info and scrolls to entries after delayed data loading', async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scroll,
    });
    const router = mountCard();
    const enter = await screen.findByRole('link', {
      name: 'Pages.Event.Entries.Enter',
    });
    expect(enter).toHaveAttribute(
      'href',
      '/events/test-event?tab=info#entries'
    );
    expect(
      screen.getByRole('link', { name: 'View Pages.Event.Tabs.Results' })
    ).toHaveAttribute('href', '/events/test-event?tab=results');
    fireEvent.click(enter);
    await screen.findByText('Entry form');
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    expect(scroll.mock.instances).toContain(document.getElementById('entries'));
    expect(router.state.location.hash).toBe('entries');
  });

  it.each([
    { entriesStatus: 'CLOSED' as const },
    { entriesConfigured: false },
    { relay: true },
  ])('keeps the detail action for %j', async overrides => {
    mountCard(overrides);
    const link = await screen.findByRole('link', {
      name: 'View Pages.Event.Tabs.Detail',
    });
    expect(link).toHaveAttribute('href', '/events/test-event?tab=info');
    expect(
      screen.queryByRole('link', { name: 'Pages.Event.Entries.Enter' })
    ).toBeNull();
  });
});
