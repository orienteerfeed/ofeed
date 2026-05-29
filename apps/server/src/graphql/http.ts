import { GraphQLError } from 'graphql';
import { createYoga, maskError } from 'graphql-yoga';

import { isAuthzError } from '../utils/authz.js';
import { createGraphQLContextFromRequest, type GraphQLContext } from './context.js';
import { schema } from './schema.js';

function authzStatusToCode(statusCode: number): string {
  if (statusCode === 401) return 'UNAUTHENTICATED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  return 'BAD_USER_INPUT';
}

export const yoga = createYoga<{
  requestId?: string;
}>({
  schema,
  graphqlEndpoint: '/graphql',
  context: async ({ request, requestId }): Promise<GraphQLContext> =>
    createGraphQLContextFromRequest(request, requestId),
  maskedErrors: {
    maskError(error: GraphQLError, message: string, isDev?: boolean) {
      if (isAuthzError(error.originalError)) {
        const authzErr = error.originalError;
        return new GraphQLError(authzErr.message, {
          nodes: error.nodes,
          source: error.source,
          positions: error.positions,
          path: error.path,
          extensions: {
            code: authzStatusToCode(authzErr.statusCode),
            http: { status: authzErr.statusCode },
          },
        });
      }
      return maskError(error, message, isDev);
    },
  },
});
