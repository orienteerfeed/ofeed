// Real components, router and Apollo hooks; deterministic transport, dev-only entry.
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import type { UserNotification } from '@repo/shared';
import { NotificationBell } from '../../src/components/molecules/NotificationBell';
import { NotificationsPage } from '../../src/pages/Notifications/NotificationsPage';
import { ThemeProvider } from '../../src/providers/ThemeProvider';
import { useAuthStore } from '../../src/stores/auth';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const listeners = new Set<() => void>();
let failed = false;
let messages: UserNotification[] = [];
const add = (id: string) => {
  messages.unshift({
    id,
    kind: 'ENTRY_ORDER_RECEIVED',
    eventId: 'race',
    entryId: id,
    eventName: `Race ${id}`,
    itemCount: 2,
    amount: null,
    currency: null,
    method: null,
    createdAt: new Date().toISOString(),
    readAt: null,
  });
  listeners.forEach(listener => listener());
};
for (let i = 1; i <= 25; i++) add(`order-${i}`);
declare global {
  interface Window {
    notificationFixture: {
      add: (id: string) => void;
      fail: (value: boolean) => void;
    };
  }
}
window.notificationFixture = {
  add,
  fail: value => {
    failed = value;
    listeners.forEach(listener => listener());
  },
};
useAuthStore.setState({
  token: 'fixture-token',
  user: {
    id: 7,
    email: 'owner@fixture.invalid',
    firstname: 'Test',
    lastname: 'Owner',
    role: 'USER',
  },
});
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink(
    operation =>
      new Observable(observer => {
        const name = operation.operationName;
        if (name === 'MyNotificationsChanged') {
          const notify = () =>
            observer.next({ data: { myNotificationsChanged: true } });
          listeners.add(notify);
          notify();
          return () => {
            listeners.delete(notify);
          };
        }
        if (name === 'MyNotifications') {
          if (failed) {
            observer.error(new Error('synthetic offline'));
            return;
          }
          const after = operation.variables.after as string | null;
          const offset = after
            ? messages.findIndex(message => message.id === after) + 1
            : 0;
          const notifications = messages
            .slice(offset, offset + 20)
            .map(message => ({ ...message }));
          observer.next({
            data: {
              myNotifications: {
                notifications,
                unreadCount: messages.filter(message => !message.readAt).length,
                endCursor: notifications.at(-1)?.id ?? null,
                hasNextPage: messages.length > offset + 20,
              },
            },
          });
        } else if (
          name === 'MarkNotificationRead' ||
          name === 'MarkAllNotificationsRead'
        ) {
          messages = messages.map(message =>
            name === 'MarkAllNotificationsRead' ||
            message.id === operation.variables.id
              ? {
                  ...message,
                  readAt: message.readAt ?? new Date().toISOString(),
                }
              : message
          );
          observer.next({
            data:
              name === 'MarkNotificationRead'
                ? { markNotificationRead: true }
                : { markAllNotificationsRead: true },
          });
          listeners.forEach(listener => listener());
        } else observer.next({ data: {} });
        observer.complete();
        return undefined;
      })
  ),
});
const queryClient = new QueryClient();
const root = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ApolloProvider client={client}>
        <ThemeProvider>
          <Outlet />
        </ThemeProvider>
      </ApolloProvider>
    </QueryClientProvider>
  ),
});
const fixture = createRoute({
  getParentRoute: () => root,
  path: '/e2e/fixtures/notifications.html',
  component: () => (
    <div className="p-6">
      <h1>Notification fixture</h1>
      <NotificationBell />
    </div>
  ),
});
const history = createRoute({
  getParentRoute: () => root,
  path: '/notifications',
  component: NotificationsPage,
});
const detail = createRoute({
  getParentRoute: () => root,
  path: '/events/$eventId/entries/$entryId',
  component: () => <h1>Order detail</h1>,
});
const router = createRouter({
  routeTree: root.addChildren([fixture, history, detail]),
});
void i18n
  .changeLanguage('en')
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <RouterProvider router={router} />
    )
  );
