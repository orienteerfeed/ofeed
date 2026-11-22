// Real feature components/hooks with a deterministic transport; dev-only entry.
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import type { UserNotification } from '@repo/shared';
import { EventFavoritesProvider } from '../../src/pages/Event/EventFavoritesProvider';
import { FavoriteCompetitorButton } from '../../src/pages/Event/FavoriteCompetitorButton';
import { EventFavoritesView } from '../../src/pages/Event/EventFavoritesView';
import { NotificationBell } from '../../src/components/molecules/NotificationBell';
import { AthleteFollows } from '../../src/pages/Profile/AthleteFollows';
import { ThemeProvider } from '../../src/providers/ThemeProvider';
import { useAuthStore } from '../../src/stores/auth';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const rows = [1, 2].map(id => ({
  id,
  firstname: 'Test',
  lastname: `Runner ${id}`,
  registration: `TST900${id}`,
  organisation: 'Test club',
  status: 'Inactive',
  startTime: '2026-11-13T09:00:00Z',
  finishTime: null,
  time: null as number | null,
  class: { id: 1, name: 'H21', resultListMode: 'Default' },
  radioSplits: [],
}));
const inbox: Array<UserNotification & { recipientId: number }> = [];
const changed = new Set<() => void>();
const resultChanged = new Set<(id: number) => void>();
const serverKey = (userId: number) => `fixture:account-favorites:${userId}`;
const serverIds = (userId: number) =>
  JSON.parse(localStorage.getItem(serverKey(userId)) ?? '[]') as number[];
const pausedKey = (userId: number) => `fixture:paused-follows:${userId}`;
const pausedIds = (userId: number) =>
  JSON.parse(localStorage.getItem(pausedKey(userId)) ?? '[]') as number[];
const account = (id: number | null) => {
  useAuthStore.setState({
    token: id ? 'fixture-token' : null,
    user: id
      ? {
          id,
          email: `owner-${id}@fixture.invalid`,
          firstname: 'Test',
          lastname: 'User',
          role: 'USER',
        }
      : null,
  });
};
const queryUser = new URLSearchParams(location.search).get('user');
if (queryUser) account(Number(queryUser));
declare global {
  interface Window {
    favoritesFixture: { account: typeof account; update: (id: number) => void };
  }
}
window.favoritesFixture = {
  account,
  update: id => {
    const row = rows.find(item => item.id === id)!;
    row.status = 'Active';
    row.time = (row.time ?? 0) + 60;
    resultChanged.forEach(listener => listener(id));
    const userId = useAuthStore.getState().user?.id;
    if (
      userId &&
      serverIds(Number(userId)).includes(id) &&
      !pausedIds(Number(userId)).includes(id)
    ) {
      inbox.unshift({
        recipientId: Number(userId),
        id: `message-${inbox.length}`,
        kind: 'COMPETITOR_RESULT_CHANGED',
        eventId: 'race',
        entryId: null,
        competitorId: id,
        competitorName: `${row.lastname} ${row.firstname}`,
        eventName: 'Favorite race',
        status: row.status,
        raceTime: row.time,
        itemCount: null,
        amount: null,
        currency: null,
        method: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      });
      changed.forEach(listener => listener());
    }
  },
};

function createClient(userId: number | null) {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink(
      operation =>
        new Observable(observer => {
          const name = operation.operationName;
          if (name === 'FavoriteCompetitorUpdated') {
            const callback = (id: number) =>
              observer.next({ data: { competitorUpdated: { id } } });
            resultChanged.add(callback);
            return () => {
              resultChanged.delete(callback);
            };
          }
          if (
            name === 'MyNotificationsChanged' ||
            name === 'EventFavoriteSelectionChanged' ||
            name === 'AthleteFollowsChanged'
          ) {
            const callback = () =>
              observer.next({ data: { myNotificationsChanged: true } });
            changed.add(callback);
            callback();
            return () => {
              changed.delete(callback);
            };
          }
          if (name === 'MyAthleteFollows')
            observer.next({
              data: {
                myAthleteFollows: userId
                  ? serverIds(userId).map(id => {
                      const row = rows.find(item => item.id === id)!;
                      return {
                        id: `follow-${id}`,
                        registration: row.registration,
                        source: 'LOCAL',
                        displayName: `${row.lastname} ${row.firstname}`,
                        pausedAt: pausedIds(userId).includes(id)
                          ? '2026-11-13T10:00:00Z'
                          : null,
                        createdAt: '2026-11-13T09:00:00Z',
                      };
                    })
                  : [],
              },
            });
          else if (name === 'SetAthleteFollowPaused') {
            const id = Number(
              String(operation.variables.id).replace('follow-', '')
            );
            const ids = new Set(pausedIds(userId!));
            if (operation.variables.paused) ids.add(id);
            else ids.delete(id);
            localStorage.setItem(pausedKey(userId!), JSON.stringify([...ids]));
            observer.next({ data: { setAthleteFollowPaused: true } });
            changed.forEach(callback => callback());
          } else if (name === 'RemoveAthleteFollow') {
            const id = Number(
              String(operation.variables.id).replace('follow-', '')
            );
            localStorage.setItem(
              serverKey(userId!),
              JSON.stringify(serverIds(userId!).filter(value => value !== id))
            );
            observer.next({ data: { removeAthleteFollow: true } });
            changed.forEach(callback => callback());
          } else if (name === 'MyEventFavoriteIds')
            observer.next({
              data: {
                myEventFavoriteCompetitorIds: userId ? serverIds(userId) : [],
              },
            });
          else if (name === 'EventFavoriteCompetitors')
            observer.next({
              data: {
                eventFavoriteCompetitors: rows
                  .filter(row =>
                    operation.variables.competitorIds.includes(row.id)
                  )
                  .map(row => ({ ...row })),
              },
            });
          else if (name === 'SetCompetitorFavorite') {
            const ids = new Set(userId ? serverIds(userId) : []);
            if (operation.variables.favorite)
              ids.add(operation.variables.competitorId);
            else ids.delete(operation.variables.competitorId);
            localStorage.setItem(serverKey(userId!), JSON.stringify([...ids]));
            observer.next({
              data: { setCompetitorFavorite: operation.variables.favorite },
            });
            changed.forEach(callback => callback());
          } else if (name === 'MyNotifications')
            observer.next({
              data: {
                myNotifications: {
                  notifications: userId
                    ? inbox
                        .filter(
                          item =>
                            item.recipientId === userId &&
                            serverIds(userId).includes(item.competitorId!)
                        )
                        .map(item => ({ ...item }))
                    : [],
                  unreadCount: userId
                    ? inbox.filter(
                        item =>
                          item.recipientId === userId &&
                          !item.readAt &&
                          serverIds(userId).includes(item.competitorId!)
                      ).length
                    : 0,
                  endCursor: null,
                  hasNextPage: false,
                },
              },
            });
          else if (name === 'MarkNotificationRead') {
            const item = inbox.find(item => item.id === operation.variables.id);
            if (item) item.readAt = new Date().toISOString();
            observer.next({ data: { markNotificationRead: true } });
            changed.forEach(callback => callback());
          } else if (name === 'MarkAllNotificationsRead') {
            inbox.forEach(item => {
              item.readAt = new Date().toISOString();
            });
            observer.next({ data: { markAllNotificationsRead: true } });
            changed.forEach(callback => callback());
          } else observer.next({ data: {} });
          observer.complete();
          return undefined;
        })
    ),
  });
}
function Scope() {
  const userId = useAuthStore(state => state.user?.id ?? null);
  const client = useMemo(
    () => createClient(userId ? Number(userId) : null),
    [userId]
  );
  useEffect(() => () => client.stop(), [client]);
  return (
    <ApolloProvider key={userId ?? 'guest'} client={client}>
      <ThemeProvider>
        <Outlet />
      </ThemeProvider>
    </ApolloProvider>
  );
}
function Fixture() {
  const { t } = useTranslation();
  const user = useAuthStore(state => state.user);
  const [view, setView] = useState(
    new URLSearchParams(location.search).get('tab') ?? 'results'
  );
  return (
    <main className="mx-auto max-w-3xl p-4">
      <h1>Favorite race</h1>
      {user && <NotificationBell />}
      {user && <Link to="/profile">Manage following</Link>}
      <EventFavoritesProvider key={user?.id ?? 'guest'} eventId="race">
        <div className="my-4 flex gap-4" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'results'}
            onClick={() => setView('results')}
          >
            Results
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'favorites'}
            onClick={() => setView('favorites')}
          >
            {t('Favorites.Title')}
          </button>
        </div>
        {view === 'favorites' ? (
          <EventFavoritesView />
        ) : (
          <ul>
            {rows.map(row => (
              <li className="flex items-center gap-2 border-b p-2" key={row.id}>
                <FavoriteCompetitorButton competitorId={row.id} />
                <span>
                  {row.lastname} {row.firstname}
                </span>
              </li>
            ))}
          </ul>
        )}
      </EventFavoritesProvider>
    </main>
  );
}
const root = createRootRoute({ component: Scope });
const fixture = createRoute({
  getParentRoute: () => root,
  path: '/e2e/fixtures/favorites.html',
  component: Fixture,
});
const event = createRoute({
  getParentRoute: () => root,
  path: '/events/$eventId',
  component: () => <Fixture key="event" />,
});
const profile = createRoute({
  getParentRoute: () => root,
  path: '/profile',
  component: () => (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <NotificationBell />
      <AthleteFollows />
      <Link
        to="/events/$eventId"
        params={{ eventId: 'race' }}
        search={{ tab: 'favorites' }}
      >
        Back to event
      </Link>
    </main>
  ),
});
const router = createRouter({
  routeTree: root.addChildren([fixture, event, profile]),
});
void i18n
  .changeLanguage('en')
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <RouterProvider router={router} />
    )
  );
