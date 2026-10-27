// Real feature components and Apollo operations, with a deterministic transport.
// This entry is served only by Vite dev, and is not a production build entry.
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
  RouterProvider,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import { ClassIndividualSplit } from '../../src/pages/Event/ClassIndividualSplit';
import { EventResultsView } from '../../src/pages/Event/EventResultsView';
import type { Event } from '../../src/types/event';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const view = new URLSearchParams(location.search).get('view') ?? 'splits';
const isRelay = view === 'relay';
const codes = Array.from({ length: 20 }, (_, i) => String(31 + i));
const runner = (id: number) => ({
  __typename: 'Competitor',
  id: String(id),
  firstname: 'Jan',
  lastname: `Runner ${id}`,
  registration: '',
  bibNumber: String(id),
  organisationId: 1,
  organisation: 'Test club',
  card: '',
  startTime: '2026-10-27T10:00:00Z',
  finishTime: '2026-10-27T11:00:00Z',
  time: 1800 + id * 10,
  status: 'OK',
  updatedAt: '2026-10-27T11:00:00Z',
  lateStart: false,
  note: null,
  rankingPoints: null,
  rankingReferenceValue: null,
  countsTowardsRanking: false,
  countsTowardsRankingReason: null,
  leg: isRelay ? (id % 2) + 1 : null,
  teamId: isRelay ? Math.ceil(id / 2) : null,
  team: isRelay
    ? { id: Math.ceil(id / 2), name: `Team ${Math.ceil(id / 2)}` }
    : null,
  class: { id: 1, name: 'H21', resultListMode: null },
  splits: codes.map((controlCode, index) => ({
    controlCode,
    time: (index + 1) * 60 + id,
  })),
});
let runners = Array.from({ length: 80 }, (_, i) => runner(i + 1));
let hold = false;
let fail = false;
let revoked = false;
const pending: Array<() => void> = [];
const subscriptions = new Map<
  string,
  (data: Record<string, unknown>) => void
>();
const counts: Record<string, number> = {};
const organisations = [
  {
    id: 1,
    name: 'Test club',
    countryCode: 'CZE',
    country: 'Czechia',
    competitors: 80,
  },
];

const client = new ApolloClient({
  cache: new InMemoryCache(),
  link: new ApolloLink(
    operation =>
      new Observable(observer => {
        const name = operation.operationName ?? 'Unnamed';
        counts[name] = (counts[name] ?? 0) + 1;
        if (name.includes('Updated')) {
          const field =
            name === 'SplitCompetitorsByClassUpdated'
              ? 'splitCompetitorsByClassUpdated'
              : 'competitorsByClassUpdated';
          subscriptions.set(name, data => observer.next({ data }));
          if (name !== 'WinnerUpdated' && name !== 'CompetitorUpdatedFeed')
            observer.next({ data: { [field]: runners } });
          return () => {
            subscriptions.delete(name);
          };
        }
        const respond = () => {
          if (fail) {
            observer.error(new Error('Fixture offline'));
            return;
          }
          const data =
            name === 'SplitPublicationStatus'
              ? {
                  splitPublicationStatus: {
                    eventId: 'fixture',
                    classId: 1,
                    mode: 'UNRESTRICTED',
                    isPublished: !revoked,
                    isAccessible: !revoked,
                    publishAt: null,
                    reason: revoked ? 'DISABLED' : 'PUBLISHED',
                  },
                }
              : name === 'SplitCourseDistances'
                ? { splitCourseDistances: null }
                : name === 'OrganisationNames'
                  ? { organisationNames: organisations }
                  : name === 'CompetitorsByOrganisation'
                    ? {
                        competitorsByOrganisation: runners.map(row => ({
                          ...row,
                          class: { ...row.class, competitors: runners },
                        })),
                      }
                    : name === 'ResultFeedByEvent'
                      ? { resultFeedByEvent: runners }
                      : {};
          observer.next({ data });
          observer.complete();
        };
        if (hold) pending.push(respond);
        else respond();
        return undefined;
      })
  ),
});

export interface FixtureControls {
  hold: () => void;
  release: (error?: boolean) => void;
  update: () => void;
  revoke: () => Promise<unknown>;
  counts: Record<string, number>;
}
declare global {
  interface Window {
    resultsRefresh: FixtureControls;
  }
}
window.resultsRefresh = {
  hold: () => {
    hold = true;
  },
  release: (error = false) => {
    hold = false;
    fail = error;
    pending.splice(0).forEach(respond => respond());
    fail = false;
  },
  update: () => {
    runners = [
      ...runners.map(row =>
        row.id === '80'
          ? {
              ...row,
              time: 1200,
              lastname: 'Very long updated competitor name '.repeat(5),
            }
          : row
      ),
      {
        ...runner(81),
        time: 1100,
        finishTime: '2026-10-27T11:01:00Z',
        splits: runner(81).splits.slice(0, 3),
      },
    ];
    subscriptions.get('SplitCompetitorsByClassUpdated')?.({
      splitCompetitorsByClassUpdated: runners,
    });
    subscriptions.get('CompetitorsByClassUpdated')?.({
      competitorsByClassUpdated: runners,
    });
    subscriptions.get('CompetitorUpdatedFeed')?.({
      competitorUpdated: runners.at(-1),
    });
  },
  revoke: () => {
    revoked = true;
    return client.refetchQueries({ include: ['SplitPublicationStatus'] });
  },
  counts,
};
const event = {
  id: 'fixture',
  name: 'Fixture event',
  relay: isRelay,
  ranking: false,
  country: { countryCode: 'CZ' },
  classes: [{ id: 1, name: 'H21' }],
} as Event;
function Fixture() {
  const { t } = useTranslation();
  return (
    <ApolloProvider client={client}>
      <div style={{ height: 250 }} />
      <div
        data-testid="fixture-scroll"
        data-result-scroll
        style={{ height: 400, overflow: 'auto', width: '100%' }}
      >
        {view === 'splits' ? (
          <ClassIndividualSplit
            t={t}
            event={{ ...event, classes: event.classes! }}
            selectedClass={1}
            onClassChange={() => {}}
          />
        ) : (
          <EventResultsView t={t} event={event} />
        )}
      </div>
      <div style={{ height: 1000 }} />
    </ApolloProvider>
  );
}
const root = createRootRoute();
const route = createRoute({
  getParentRoute: () => root,
  path: '/e2e/fixtures/results-refresh.html',
  component: Fixture,
});
const router = createRouter({ routeTree: root.addChildren([route]) });
void i18n
  .changeLanguage('en')
  .then(() =>
    createRoot(document.getElementById('root')!).render(
      <RouterProvider router={router} />
    )
  );
