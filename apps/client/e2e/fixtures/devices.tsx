// Real settings panel with a deterministic transport; no native receiver is started.
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
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { createRoot } from 'react-dom/client';
import { EventDeviceSettingsPanel } from '../../src/pages/Event/Insights/EventDeviceInsightPage';
import type { Status } from '../../src/pages/Event/Insights/event-device-api';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const status: Status = {
  devices: [],
  yarocSettings: {
    hours: 24,
    checkCode: 3,
    startCode: 1,
    finishCode: 2,
    brokerProfile: 'default',
    meshtasticChannel: null,
  },
  yarocAvailable: true,
  sessionUntil: null,
  brokerProfiles: ['default', 'club'],
  monitoringStartedAt: null,
  monitoringUntil: null,
  sessionState: 'stopped',
  sessionError: null,
};
const calls: { operation: string; variables: Record<string, unknown> }[] = [];
declare global {
  interface Window {
    deviceSettingsFixture: { calls: typeof calls };
  }
}
window.deviceSettingsFixture = { calls };
const link = new ApolloLink(
  operation =>
    new Observable(observer => {
      const variables = operation.variables;
      const name = operation.operationName ?? '';
      let data: Record<string, unknown>;
      if (name === 'Event') {
        data = {
          event: {
            id: 'race',
            sportId: 1,
            slug: 'test-race',
            name: 'Test Race',
            featuredImage: null,
            organizer: null,
            location: null,
            country: null,
            sport: { id: 1, name: 'Orienteering' },
            date: '2026-11-13',
            timezone: 'Europe/Prague',
            discipline: null,
            externalSource: null,
            externalEventId: null,
            entriesOpenAt: null,
            entriesCloseAt: null,
            resultsOfficialAt: null,
            resultsOfficialManuallySetAt: null,
            ranking: null,
            coefRanking: null,
            eventFormat: null,
            defaultStartMode: null,
            relay: false,
            published: false,
            authorId: 1,
            classes: [],
            user: null,
            statusSummary: null,
          },
        };
      } else if (name === 'EventLiveStatus') {
        // Snapshot data must not be mutated after handing it to the Apollo cache.
        data = { eventLiveStatus: structuredClone(status) };
      } else {
        calls.push({ operation: name, variables });
        if (name === 'RegisterLiveDevice') {
          const id = `radio-${status.devices.length + 1}`;
          status.devices.push({
            id,
            name: String(variables.name),
            sourceType: String(variables.sourceType),
            macAddress: String(variables.macAddress),
            intervalSeconds: Number(variables.intervalSeconds),
            revoked: false,
            status: 'waiting',
            lastSeenAt: null,
          });
          data = {
            registerLiveDevice: { deviceId: id, token: 'fixture-token' },
          };
        } else if (name === 'StartLiveMonitoring') {
          status.monitoringStartedAt = new Date().toISOString();
          status.monitoringUntil = new Date(
            Date.now() + Number(variables.hours) * 3600_000
          ).toISOString();
          data = { startLiveMonitoring: true };
        } else if (name === 'UpdateEventYarocSettings') {
          status.yarocSettings = {
            hours: Number(variables.hours),
            checkCode: Number(variables.checkCode),
            startCode: Number(variables.startCode),
            finishCode: Number(variables.finishCode),
            brokerProfile: String(variables.brokerProfile),
            meshtasticChannel: variables.meshtasticChannel as string | null,
          };
          data = { updateEventYarocSettings: true };
        } else if (name === 'StartYaroc') {
          status.sessionState = 'running';
          status.sessionUntil = new Date(
            Date.now() + Number(variables.hours) * 3600_000
          ).toISOString();
          data = { startYaroc: true };
        } else if (name === 'StopYaroc') {
          status.sessionState = 'stopped';
          data = { stopYaroc: true };
        } else {
          observer.error(new Error(`Unsupported fixture operation: ${name}`));
          return;
        }
      }
      queueMicrotask(() => {
        observer.next({ data });
        observer.complete();
      });
    })
);
const client = new ApolloClient({ link, cache: new InMemoryCache() });
const root = createRootRoute({ component: Outlet });
const page = createRoute({
  getParentRoute: () => root,
  path: '/e2e/fixtures/devices.html',
  component: () => (
    <main className="mx-auto max-w-5xl p-4">
      <EventDeviceSettingsPanel eventId="race" />
    </main>
  ),
});
const router = createRouter({ routeTree: root.addChildren([page]) });
void i18n.changeLanguage('en').then(() => {
  createRoot(document.getElementById('root')!).render(
    <ApolloProvider client={client}>
      <RouterProvider router={router} />
    </ApolloProvider>
  );
});
