// lib/apollo-client.ts
import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
} from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { ErrorLink } from '@apollo/client/link/error';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { type ClientOptions, createClient } from 'graphql-ws';
import { getGraphQLUrls, getToken } from '../lib/api/apollo-client-helper';

export type ApolloUrls = {
  httpUrl: string;
  wsUrl?: string;
};

export type GetTokenFn = () => string | null;

// Ping the server on an idle socket; without this, mobile radios and reverse
// proxies (e.g. Traefik) silently drop idle WebSocket connections.
const WS_KEEP_ALIVE_MS = 10_000;
// How long to wait for the pong before declaring the connection dead. Mobile
// browsers freeze a backgrounded tab and the radio can drop without a clean
// close, so we detect that here and force a reconnect.
const WS_PONG_WAIT_MS = 5_000;
// WebSocket.OPEN — referenced as a constant so this builder stays usable in
// non-browser/test environments that lack a global WebSocket.
const WEB_SOCKET_OPEN = 1;

function toWsUrl(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return httpUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  }
}

type CloseableSocket = {
  readyState: number;
  close: (code?: number, reason?: string) => void;
};

/**
 * Builds resilient `graphql-ws` client options.
 *
 * The defaults (`retryAttempts: 5`, `keepAlive: 0`) cause the results
 * subscription to error out permanently on mobile: a backgrounded tab freezes,
 * the socket closes, the five reconnect attempts are exhausted within ~30s
 * while the device sleeps, and `graphql-ws` then throws a terminal error that
 * Apollo surfaces as "Error loading results" with no recovery.
 *
 * Retrying indefinitely (fatal close codes still terminate) plus keep-alive
 * pings with broken-connection detection keeps the subscription alive and lets
 * it re-establish once connectivity returns.
 */
export function buildWsClientOptions(
  wsUrl: string,
  getTokenFn: GetTokenFn,
): ClientOptions {
  let activeSocket: CloseableSocket | null = null;
  let pongWaitTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    url: wsUrl,
    lazy: true,
    keepAlive: WS_KEEP_ALIVE_MS,
    retryAttempts: Number.POSITIVE_INFINITY,
    shouldRetry: () => true,
    connectionParams: () => {
      const token = getTokenFn();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },
    on: {
      connected: socket => {
        activeSocket = socket as CloseableSocket;
      },
      ping: received => {
        // `received: false` means we sent the ping; wait for the pong.
        if (!received) {
          pongWaitTimer = setTimeout(() => {
            if (activeSocket?.readyState === WEB_SOCKET_OPEN) {
              activeSocket.close(4408, 'Request Timeout');
            }
          }, WS_PONG_WAIT_MS);
        }
      },
      pong: received => {
        if (received) {
          clearTimeout(pongWaitTimer);
        }
      },
    },
  };
}

/** Creates ApolloLink chain: error -> auth -> split(WS/HTTP) */
function createApolloLink(urls: ApolloUrls, getToken: GetTokenFn): ApolloLink {
  // --- HTTP link
  const httpLink = new HttpLink({
    uri: urls.httpUrl,
    credentials: 'include',
  });

  // --- Auth headers using SetContextLink
  // In Apollo Client 4, SetContextLink passes the current context object
  // (not an Operation) as the sole argument. Per-request headers set via
  // mutate({ context: { headers: {...} } }) arrive here already merged in.
  const authLink = new SetContextLink((context) => {
    const { headers = {} } = context as { headers?: Record<string, string> };
    const token = getToken();
    return {
      headers: {
        ...headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  });

  // --- Error handling using ErrorLink
  const errorLink = new ErrorLink(error => {
    if (error && typeof error === 'object' && 'graphQLErrors' in error) {
      const graphQLErrors = (error as { graphQLErrors?: unknown })
        .graphQLErrors;
      console.warn(
        `[GQL errors] ${
          (error as { operation?: { operationName?: string } }).operation
            ?.operationName ?? 'unknown'
        }`,
        graphQLErrors
      );
    }
    if (error && typeof error === 'object' && 'networkError' in error) {
      console.error(
        '[Network error]',
        (error as { networkError?: unknown }).networkError
      );
    }
  });

  // --- WS link (subscriptions) – only in browser
  let wsLink: ApolloLink | null = null;

  if (typeof window !== 'undefined') {
    const wsUrl = urls.wsUrl ?? toWsUrl(urls.httpUrl);

    const wsClient = createClient(buildWsClientOptions(wsUrl, getToken));

    wsLink = new GraphQLWsLink(wsClient);
  }

  // --- Split: subscriptions over WS, others over HTTP
  const splitLink = wsLink
    ? ApolloLink.split(
        ({ query }) => {
          const def = getMainDefinition(query);
          return (
            def.kind === 'OperationDefinition' &&
            def.operation === 'subscription'
          );
        },
        wsLink,
        httpLink
      )
    : httpLink;
  return ApolloLink.from([errorLink, authLink, splitLink]);
}

export function createApolloClient(
  urls: ApolloUrls,
  getToken: GetTokenFn
): ApolloClient {
  const link = createApolloLink(urls, getToken);

  const cache = new InMemoryCache({
    typePolicies: {
      Country: {
        keyFields: ['countryCode'],
      },
      Event: {
        fields: {
          statusSummary: {
            merge(existing, incoming, { mergeObjects }) {
              return mergeObjects(existing, incoming);
            },
          },
        },
      },
      Query: {
        fields: {
          // Add your type policies here
        },
      },
    },
  });

  return new ApolloClient({
    link,
    cache,
  });
}

const { httpUrl, wsUrl } = getGraphQLUrls();

export const apolloClient = createApolloClient(
  {
    httpUrl,
    wsUrl,
  },
  getToken
);
