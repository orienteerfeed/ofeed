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

  // --- Auth headers using SetContextLink (updated approach due to deprecation)
  const authLink = new SetContextLink((_, previousContext) => {
    const token = getToken();
    return {
      headers: {
        ...((previousContext as any)?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  });

  // --- Error handling using ErrorLink
  const errorLink = new ErrorLink(((error: any) => {
    const { graphQLErrors, networkError, operation } = error;
    if (graphQLErrors) {
      console.warn(
        `[GQL errors] ${operation.operationName ?? 'unknown'}`,
        graphQLErrors
      );
    }
    if (networkError) {
      console.error('[Network error]', networkError);
    }
  }) as any);

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
          // events: relayStylePagination(),
        },
      },
    },
  });

  return new ApolloClient({
    link,
    cache,
  });
}
