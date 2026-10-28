// Real catalog/report, routing and Apollo hooks with deterministic timing data.
// Vite development fixture only; not a production entry or an auth substitute.
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
import type { AnomalyFinding, EventAnomalyInsight } from '@repo/shared';
import { createRoot } from 'react-dom/client';
import { EventInsightsPage } from '../../src/pages/Event/Insights/EventInsightsPage';
import { EventAnomalyInsightPage } from '../../src/pages/Event/Insights/EventAnomalyInsightPage';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const evidence: AnomalyFinding = {
  type: 'FAST_FIRST_SPLIT',
  controlCode: 31,
  splitSeconds: 20,
  medianSeconds: 100,
  differenceSeconds: 80,
  referenceCount: 8,
  intervalSeconds: null,
  phaseSeconds: null,
  nearestStartTime: null,
  punchTimes: [],
};
const report: EventAnomalyInsight = {
  competitors: Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    firstname: index === 0 ? '<script>example</script>' : 'Jan',
    lastname:
      index === 29 ? '=SUM(1)' : `Runner-${String(index + 1).padStart(2, '0')}`,
    registration: `REG${index + 1}`,
    bibNumber: index + 1,
    card: 1000 + index,
    classId: index < 20 ? 1 : 2,
    className: index < 20 ? 'H21' : 'D21',
    organisation: 'Fixture club',
    startMode: 'StartList',
    startTime: '2026-10-28T10:00:13.000Z',
    findings: [
      evidence,
      {
        ...evidence,
        type: 'START_PUNCH',
        controlCode: null,
        splitSeconds: null,
        medianSeconds: null,
        differenceSeconds: null,
        referenceCount: null,
        punchTimes: ['2026-10-28T10:00:13.000Z'],
      },
      ...(index === 29
        ? [
            {
              ...evidence,
              type: 'OFF_START_GRID' as const,
              controlCode: null,
              splitSeconds: null,
              medianSeconds: null,
              referenceCount: null,
              differenceSeconds: 13,
              intervalSeconds: 60,
              phaseSeconds: 0,
              nearestStartTime: '2026-10-28T10:00:00.000Z',
            },
          ]
        : []),
    ],
  })),
  coverage: [1, 2].flatMap(classId => [
    {
      classId,
      className: classId === 1 ? 'H21' : 'D21',
      type: 'FAST_FIRST_SPLIT' as const,
      status: 'EVALUATED' as const,
      evaluated: classId === 1 ? 20 : 10,
      total: classId === 1 ? 20 : 10,
    },
    {
      classId,
      className: classId === 1 ? 'H21' : 'D21',
      type: 'START_PUNCH' as const,
      status: 'EVALUATED' as const,
      evaluated: classId === 1 ? 20 : 10,
      total: classId === 1 ? 20 : 10,
    },
    {
      classId,
      className: classId === 1 ? 'H21' : 'D21',
      type: 'OFF_START_GRID' as const,
      status:
        classId === 1 ? ('NO_RELIABLE_GRID' as const) : ('EVALUATED' as const),
      evaluated: classId === 1 ? 0 : 10,
      total: classId === 1 ? 20 : 10,
    },
  ]),
};
const event = {
  id: 'fixture',
  sportId: 1,
  slug: null,
  name: 'Anomaly fixture event',
  featuredImage: null,
  organizer: null,
  location: null,
  country: null,
  sport: { id: 1, name: 'Orienteering' },
  date: '2026-10-28T00:00:00Z',
  timezone: 'Europe/Prague',
  discipline: 'LONG',
  externalSource: null,
  externalEventId: null,
  entriesOpenAt: null,
  entriesCloseAt: null,
  resultsOfficialAt: null,
  resultsOfficialManuallySetAt: null,
  ranking: false,
  coefRanking: null,
  eventFormat: 'Standard',
  defaultStartMode: 'StartList',
  relay: false,
  published: false,
  authorId: 7,
  classes: [],
  user: null,
  statusSummary: null,
};
let fail = false;
declare global {
  interface Window {
    anomalyFixture: { setFailure: (value: boolean) => void };
  }
}
window.anomalyFixture = {
  setFailure: value => {
    fail = value;
  },
};
const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink(
    operation =>
      new Observable(observer => {
        const timeout = setTimeout(() => {
          if (operation.operationName === 'EventAnomalyInsight' && fail) {
            observer.error(new Error('Fixture offline'));
            return;
          }
          if (operation.operationName === 'Event')
            observer.next({ data: { event } });
          else if (operation.operationName === 'EventAnomalyInsight')
            observer.next({ data: { eventAnomalyInsight: report } });
          else
            observer.error(
              new Error(
                `Unexpected fixture operation: ${operation.operationName}`
              )
            );
          observer.complete();
        }, 20);
        return () => clearTimeout(timeout);
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
const insights = createRoute({
  getParentRoute: () => root,
  path: '/events/$eventId/insights',
  component: Outlet,
});
const catalog = createRoute({
  getParentRoute: () => insights,
  path: '/',
  component: EventInsightsPage,
});
const anomalies = createRoute({
  getParentRoute: () => insights,
  path: 'anomalies',
  component: EventAnomalyInsightPage,
});
const detail = createRoute({
  getParentRoute: () => root,
  path: '/events/$eventId',
  component: () => <p>Fixture class results</p>,
});
const deepLink = new URLSearchParams(location.search).has('report');
history.replaceState(
  null,
  '',
  `/events/fixture/insights${deepLink ? '/anomalies' : '/'}`
);
const router = createRouter({
  routeTree: root.addChildren([
    insights.addChildren([catalog, anomalies]),
    detail,
  ]),
});
void i18n
  .changeLanguage('en')
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <RouterProvider router={router} />
    )
  );
