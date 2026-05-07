import { createYoga } from 'graphql-yoga';

import { createGraphQLContextFromRequest, type GraphQLContext } from './context.js';
import { schema } from './schema.js';

export const yoga = createYoga<{
  requestId?: string;
}>({
  schema,
  graphqlEndpoint: '/graphql',
  context: async ({ request, requestId }): Promise<GraphQLContext> =>
    createGraphQLContextFromRequest(request, requestId),
});
