// Real admin/event components; deterministic GraphQL transport, no native reception.
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
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SystemDeviceManager } from '../../src/pages/Admin/AdminSystemDevicesPage';
import { EventDeviceSettingsPanel } from '../../src/pages/Event/Insights/EventDeviceInsightPage';
import type {
  SystemCollection,
  SystemRadio,
} from '../../src/pages/Admin/system-radio-api';
import i18n from '../../src/i18n/i18n';
import '../../src/index.css';

const events = [
  { id: 'a', name: 'Race Alpha', date: '2026-11-13T09:00:00Z' },
  { id: 'b', name: 'Race Beta', date: '2026-11-14T09:00:00Z' },
];
const devices: SystemRadio[] = [];
const collections = new Map<string, SystemCollection>();
const collection = (id: string) => {
  if (!collections.has(id))
    collections.set(id, {
      eventId: id,
      timezone: 'UTC',
      settings: { hours: 24, checkCode: 3, startCode: 1, finishCode: 2 },
      state: 'stopped',
      until: null,
      error: null,
    });
  return collections.get(id)!;
};
const registrations = new Map<
  string,
  { unit: SystemRadio; eventId: string; active: boolean }
>();
const calls: string[] = [];
declare global {
  interface Window {
    systemRadioFixture: { calls: string[] };
  }
}
window.systemRadioFixture = { calls };
const link = new ApolloLink(
  operation =>
    new Observable(observer => {
      try {
        const { operationName: name, variables } = operation;
        const eventId = String(variables.eventId ?? '');
        let data: Record<string, unknown>;
        if (name === 'AdminSystemRadios')
          data = {
            adminSystemRadios: {
              devices: devices.map(unit => ({
                ...unit,
                collectionState: unit.eventId
                  ? collection(unit.eventId).state
                  : 'stopped',
              })),
              brokerProfiles: ['default', 'club'],
              available: true,
            },
          };
        else if (name === 'AdminSystemRadioEvents')
          data = {
            adminSystemRadioEvents: events.filter(event =>
              event.name
                .toLowerCase()
                .includes(String(variables.search ?? '').toLowerCase())
            ),
          };
        else if (name === 'AdminSystemRadioCollection')
          data = {
            adminSystemRadioCollection: structuredClone(collection(eventId)),
          };
        else if (name === 'SaveSystemRadioDevice') {
          calls.push(name);
          const input = variables.input as SystemRadio;
          const previous = devices.find(unit => unit.id === variables.id);
          const unit = {
            ...input,
            id: previous?.id ?? `unit-${devices.length + 1}`,
            archived: previous?.archived ?? false,
            eventId: previous?.eventId ?? null,
            eventName: previous?.eventName ?? null,
            eventDate: previous?.eventDate ?? null,
            lastSeenAt: null,
            collectionState: 'stopped',
            collectionError: null,
          };
          if (previous) Object.assign(previous, unit);
          else devices.push(unit);
          data = { saveSystemRadioDevice: unit };
        } else if (name === 'AssignSystemRadioDevice') {
          calls.push(name);
          const unit = devices.find(unit => unit.id === variables.id)!;
          if (unit.eventId)
            registrations.get(`${unit.id}/${unit.eventId}`)!.active = false;
          const event = events.find(event => event.id === variables.eventId);
          Object.assign(unit, {
            eventId: event?.id ?? null,
            eventName: event?.name ?? null,
            eventDate: event?.date ?? null,
          });
          if (event)
            registrations.set(`${unit.id}/${event.id}`, {
              unit: structuredClone(unit),
              eventId: event.id,
              active: true,
            });
          data = { assignSystemRadioDevice: unit };
        } else if (name === 'ArchiveSystemRadioDevice') {
          calls.push(name);
          const unit = devices.find(unit => unit.id === variables.id)!;
          unit.archived = Boolean(variables.archived);
          data = { archiveSystemRadioDevice: unit };
        } else if (
          name === 'SaveSystemRadioCollection' ||
          name === 'StartSystemRadioCollection'
        ) {
          calls.push(name);
          const current = collection(eventId);
          current.settings = variables.input as SystemCollection['settings'];
          if (name === 'StartSystemRadioCollection') {
            current.state = 'running';
            current.until = new Date(
              Date.now() + current.settings.hours * 3600_000
            ).toISOString();
          }
          data = {
            [name === 'StartSystemRadioCollection'
              ? 'startSystemRadioCollection'
              : 'saveSystemRadioCollection']: current,
          };
        } else if (name === 'StopSystemRadioCollection') {
          calls.push(name);
          const current = collection(eventId);
          current.state = 'stopped';
          data = { stopSystemRadioCollection: current };
        } else if (name === 'EventLiveStatus') {
          const current = collection(eventId);
          data = {
            eventLiveStatus: {
              devices: [...registrations.entries()]
                .filter(([, value]) => value.eventId === eventId)
                .map(([id, value]) => ({
                  id,
                  name: value.unit.name,
                  sourceType: value.unit.sourceType,
                  macAddress: value.unit.macAddress,
                  systemDevice: true,
                  currentlyAssigned: value.active,
                  revoked: !value.active,
                  status:
                    value.active && current.state === 'running'
                      ? 'waiting'
                      : 'stopped',
                  intervalSeconds: value.unit.intervalSeconds,
                  lastSeenAt: null,
                  lastPunchAt: null,
                  uploadState: null,
                  uploadBytes: null,
                  uploadCompletedAt: null,
                  uploadDurationMs: null,
                  batteryPercent: null,
                  gsmRsrpDbm: null,
                  gsmSnrDb: null,
                  loraRssiDbm: null,
                  loraSnrDb: null,
                  signalBars: null,
                  latitude: null,
                  longitude: null,
                  positionAt: null,
                  errorMessage: null,
                })),
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
              brokerProfiles: ['default'],
              monitoringStartedAt: null,
              monitoringUntil: current.until,
              sessionState: 'stopped',
              sessionError: null,
              systemSessionState: current.state,
              systemSessionUntil: current.until,
              systemSessionError: null,
            },
          };
        } else if (name === 'Event') {
          data = {
            event: {
              id: eventId,
              sportId: 1,
              slug: 'test',
              name: events.find(event => event.id === eventId)?.name,
              featuredImage: null,
              organizer: null,
              location: null,
              country: null,
              sport: { id: 1, name: 'Orienteering' },
              date: '2026-11-13',
              timezone: 'UTC',
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
        } else throw new Error(`Unexpected fixture operation: ${name}`);
        queueMicrotask(() => {
          observer.next({ data: structuredClone(data) });
          observer.complete();
        });
      } catch (error) {
        observer.error(error);
      }
    })
);
const client = new ApolloClient({ link, cache: new InMemoryCache() });
function Fixture() {
  const [view, setView] = useState('admin');
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4">
      <nav className="flex gap-4">
        <button onClick={() => setView('admin')}>Admin fixture</button>
        <button onClick={() => setView('a')}>Event A fixture</button>
        <button onClick={() => setView('b')}>Event B fixture</button>
      </nav>
      {view === 'admin' ? (
        <SystemDeviceManager />
      ) : (
        <EventDeviceSettingsPanel key={view} eventId={view} />
      )}
    </main>
  );
}
const root = createRootRoute({ component: Outlet });
const page = createRoute({
  getParentRoute: () => root,
  path: '/e2e/fixtures/system-devices.html',
  component: Fixture,
});
const router = createRouter({ routeTree: root.addChildren([page]) });
void i18n.changeLanguage('en').then(() =>
  createRoot(document.getElementById('root')!).render(
    <ApolloProvider client={client}>
      <RouterProvider router={router} />
    </ApolloProvider>
  )
);
