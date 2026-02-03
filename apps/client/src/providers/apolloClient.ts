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
import { createClient } from 'graphql-ws';
import { getGraphQLUrls, getToken } from '../lib/api/apollo-client-helper';

export type ApolloUrls = {
  httpUrl: string;
  wsUrl?: string;
};

export type GetTokenFn = () => string | null;

function toWsUrl(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  } catch {
    return httpUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  }
}

/** Creates ApolloLink chain: error -> auth -> split(WS/HTTP) */
function createApolloLink(urls: ApolloUrls, getToken: GetTokenFn): ApolloLink {
  // --- HTTP link
  const httpLink = new HttpLink({
    uri: urls.httpUrl,
    credentials: 'include',
  });

  // --- Auth headers using SetContextLink
  const authLink = new SetContextLink((_, previousContext) => {
    const token = getToken();
    const previousHeaders =
      (previousContext as { headers?: Record<string, string> })?.headers || {};
    return {
      headers: {
        ...previousHeaders,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  });

  // --- Error handling using ErrorLink
  const errorLink = new ErrorLink(error => {
    if (error && typeof error === 'object' && 'graphQLErrors' in error) {
      const graphQLErrors = (
        error as { graphQLErrors?: unknown }
      ).graphQLErrors;
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

    const wsClient = createClient({
      url: wsUrl,
      lazy: true,
      connectionParams: () => {
        const token = getToken();
        return token
          ? {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          : {};
      },
    });

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
