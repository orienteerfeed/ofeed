import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
  gql,
} from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApolloProvider } from '@/providers/ApolloProvider';
import { createApolloClient } from '@/providers/apolloClient';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@/types/user';

const { router, bootstrapSession } = vi.hoisted(() => ({
  router: { invalidate: vi.fn().mockResolvedValue(undefined) },
  bootstrapSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tanstack/react-router', () => ({ useRouter: () => router }));
vi.mock('@/providers/apolloClient', () => ({ createApolloClient: vi.fn() }));
vi.mock('@/stores/auth/session-manager', () => ({
  bootstrapSession,
  initializeSessionManager: vi.fn(),
}));
vi.mock('@/lib/api/apollo-client-helper', () => ({
  getGraphQLUrls: () => ({ httpUrl: 'http://test/graphql' }),
  getToken: () => useAuthStore.getState().token,
}));
vi.mock('@/utils', () => ({ toast: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const QUERY = gql`
  query Event {
    event {
      id
      name
    }
  }
`;
const user = (id: number): User => ({
  id,
  firstname: 'Test',
  lastname: 'User',
  email: `user${id}@example.test`,
});
const clients: ApolloClient[] = [];
const responses: Array<{
  client: ApolloClient;
  reply: (name: string) => void;
}> = [];
const errors: string[] = [];

function EventDetail() {
  const { data, error, loading } = useQuery<{
    event: { id: string; name: string };
  }>(QUERY);
  if (error) errors.push(error.message);
  return <p>{error?.message ?? (loading ? 'Loading' : data?.event.name)}</p>;
}

beforeEach(() => {
  clients.length = 0;
  responses.length = 0;
  errors.length = 0;
  useAuthStore.setState({ token: null, user: null });
  vi.mocked(createApolloClient).mockImplementation(() => {
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink(
        () =>
          new Observable(observer => {
            responses.push({
              client,
              reply: name => {
                observer.next({
                  data: { event: { __typename: 'Event', id: 'event-1', name } },
                });
                observer.complete();
              },
            });
          })
      ),
    });
    vi.spyOn(client, 'stop');
    vi.spyOn(client, 'clearStore');
    clients.push(client);
    return client;
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.stop();
});

const pending = (client: ApolloClient) =>
  responses.find(response => response.client === client)!;

describe('ApolloProvider authentication scope', () => {
  it('restarts an in-flight event query when session restoration publishes the user', async () => {
    render(
      <ApolloProvider>
        <EventDetail />
      </ApolloProvider>
    );
    await waitFor(() => expect(responses).toHaveLength(1));
    const anonymous = clients.at(-1)!;
    act(() => useAuthStore.setState({ token: 'restored-token' }));
    await waitFor(() => expect(clients).toHaveLength(2));
    act(() => useAuthStore.setState({ user: user(1) }));
    const authenticated = clients.at(-1)!;
    await waitFor(() => expect(pending(authenticated)).toBeDefined());
    act(() => pending(authenticated).reply('Restored event'));
    expect(await screen.findByText('Restored event')).toBeInTheDocument();
    act(() => pending(anonymous).reply('Stale anonymous response'));
    expect(screen.queryByText('Stale anonymous response')).toBeNull();
    expect(errors).toEqual([]);
    expect(
      clients.every(
        client => vi.mocked(client.clearStore).mock.calls.length === 0
      )
    ).toBe(true);
    await waitFor(() => expect(anonymous.stop).toHaveBeenCalled());
  });

  it('isolates cached data on account switch and discards a late response after logout', async () => {
    useAuthStore.setState({ token: 'token-1', user: user(1) });
    render(
      <ApolloProvider>
        <EventDetail />
      </ApolloProvider>
    );
    const first = clients.at(-1)!;
    await waitFor(() => expect(pending(first)).toBeDefined());
    act(() => pending(first).reply('First user private data'));
    await screen.findByText('First user private data');

    act(() => useAuthStore.setState({ token: 'token-2', user: user(2) }));
    const second = clients.at(-1)!;
    expect(screen.queryByText('First user private data')).toBeNull();
    expect(second.cache.extract()).toEqual({});
    await waitFor(() => expect(pending(second)).toBeDefined());

    act(() => useAuthStore.setState({ token: null, user: null }));
    const anonymous = clients.at(-1)!;
    await waitFor(() => expect(pending(anonymous)).toBeDefined());
    act(() => pending(second).reply('Late second user private data'));
    expect(screen.queryByText('Late second user private data')).toBeNull();
    act(() => pending(anonymous).reply('Public event'));
    await screen.findByText('Public event');
    expect(JSON.stringify(anonymous.cache.extract())).not.toContain('private');
    expect(errors).toEqual([]);
  });

  it('keeps the client and in-flight query when the same user rotates their token', async () => {
    useAuthStore.setState({ token: 'old-token', user: user(1) });
    render(
      <ApolloProvider>
        <EventDetail />
      </ApolloProvider>
    );
    await waitFor(() => expect(responses).toHaveLength(1));
    const client = clients[0]!;
    act(() => useAuthStore.setState({ token: 'new-token', user: user(1) }));
    expect(clients).toHaveLength(1);
    expect(client.stop).not.toHaveBeenCalled();
    act(() => pending(client).reply('Event after renewal'));
    await screen.findByText('Event after renewal');
    expect(errors).toEqual([]);
  });

  it('keeps the active client alive through StrictMode effect replay and stops it after unmount', async () => {
    const view = render(
      <StrictMode>
        <ApolloProvider>
          <EventDetail />
        </ApolloProvider>
      </StrictMode>
    );
    await waitFor(() => expect(responses).toHaveLength(1));
    const active = responses[0]!.client;
    act(() => pending(active).reply('Strict event'));
    await screen.findByText('Strict event');
    expect(active.stop).not.toHaveBeenCalled();
    view.unmount();
    await waitFor(() => expect(active.stop).toHaveBeenCalled());
    expect(errors).toEqual([]);
  });
});
