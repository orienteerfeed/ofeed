import { pubsub } from '../lib/pubsub.js';
import { toLowerCaseHeaderRecord } from '../lib/http/headers.js';
import prisma from '../utils/context.js';
import { buildAuthContextFromRequest } from '../utils/jwtToken.js';
import type { GraphQLAuthContext, GraphQLContext } from './context.types.js';

export type { GraphQLAuthContext, GraphQLContext } from './context.types.js';

export async function createGraphQLContextFromRequest(
  request: Request,
  requestId?: string,
): Promise<GraphQLContext> {
  const auth = (await buildAuthContextFromRequest({
    headers: toLowerCaseHeaderRecord(request.headers),
  })) as GraphQLAuthContext;

  return {
    prisma,
    auth,
    pubsub,
    request,
    requestId,
    activationUrl: request.headers.get('x-orienteerfeed-app-activate-user-url') ?? 'localhost',
    resetPasswordUrl: request.headers.get('x-ofeed-app-reset-password-url') ?? 'localhost',
  };
}

export function getAuthorizationHeader(connectionParams: unknown) {
  if (!connectionParams || typeof connectionParams !== 'object') {
    return undefined;
  }

  const source = connectionParams as Record<string, unknown>;
  const authorization = source.authorization ?? source.Authorization;

  if (typeof authorization === 'string') {
    return authorization;
  }

  const headers =
    source.headers && typeof source.headers === 'object'
      ? (source.headers as Record<string, unknown>)
      : null;

  const nestedAuthorization = headers?.authorization ?? headers?.Authorization;
  return typeof nestedAuthorization === 'string' ? nestedAuthorization : undefined;
}

export async function createGraphQLContextFromConnectionParams(
  connectionParams: unknown,
): Promise<GraphQLContext> {
  const authorization = getAuthorizationHeader(connectionParams);
  const auth = (await buildAuthContextFromRequest({
    headers: authorization ? { authorization } : {},
  })) as GraphQLAuthContext;

  return {
    prisma,
    auth,
    pubsub,
    activationUrl: 'localhost',
    resetPasswordUrl: 'localhost',
  };
}
