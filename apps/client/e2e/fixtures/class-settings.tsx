// Development-only fixture: real settings page and controls, no external writes.
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
import { EventSettingsPage } from '../../src/pages/Event/Settings/EventSettingsPage';
import { useAuthStore } from '../../src/stores/auth/auth-store';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

useAuthStore.setState({
  token: 'fixture-only',
  user: {
    id: 1,
    email: 'fixture@example.test',
    firstname: 'Test',
    lastname: 'Owner',
    role: 'USER',
  },
});
const event = {
  id: 'fixture',
  slug: null,
  name: 'Test event',
  authorId: 1,
  featuredImage: null,
  organizer: 'Test club',
  location: 'Test town',
  latitude: null,
  longitude: null,
  country: { countryCode: 'CZ', countryName: 'Czechia' },
  sportId: 1,
  date: '2026-11-05T10:00:00Z',
  timezone: 'Europe/Prague',
  discipline: 'Foot',
  externalSource: 'ORIS',
  externalEventId: '123',
  entriesOpenAt: null,
  entriesCloseAt: null,
  splitPublicationMode: 'UNRESTRICTED',
  splitPublicationAt: null,
  resultsOfficialAt: null,
  resultsOfficialManuallySetAt: null,
  ranking: false,
  coefRanking: null,
  eventFormat: null,
  defaultStartMode: 'StartList',
  currency: 'CZK',
  relay: false,
  hundredthPrecision: false,
  published: true,
  eventPassword: null,
  meosEventBindings: [],
  classes: [{ id: 1, name: 'D21' }],
};
const classes = Array.from({ length: 20 }, (_, index) => ({
  id: index + 1,
  name: index === 0 ? 'D21' : `H${index + 20}`,
  maxNumberOfCompetitors: 50,
  competitorsCount: 10,
  minAge: 21,
  maxAge: null,
  minTeamMembers: null,
  maxTeamMembers: null,
  sex: 'F',
  resultListMode: null,
  fee: 150,
  lateEntryFeeDisabled: false,
  awardedPlaces: 3,
  startMode: null,
  startWindowFrom: null,
  startWindowTo: null,
}));
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink(
    operation =>
      new Observable(observer => {
        observer.next({
          data:
            operation.operationName === 'Event'
              ? { event }
              : operation.operationName === 'EventClassesSettings'
                ? { eventClasses: classes }
                : {},
        });
        observer.complete();
      })
  ),
});
const queryClient = new QueryClient();
const root = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <ApolloProvider client={client}>
        <Outlet />
      </ApolloProvider>
    </QueryClientProvider>
  ),
});
const settings = createRoute({
  getParentRoute: () => root,
  path: '/events/$eventId/settings',
  component: EventSettingsPage,
});
history.replaceState(null, '', '/events/fixture/settings?tab=classes');
const router = createRouter({ routeTree: root.addChildren([settings]) });
void i18n
  .changeLanguage('cs')
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <RouterProvider router={router} />
    )
  );
