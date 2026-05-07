import type { AppPrismaClient } from '../db/prisma-client.js';
import type { pubsub } from '../lib/pubsub.js';

export type GraphQLAuthContext =
  | {
      isAuthenticated: false;
      type: null;
      failureReason?: string;
    }
  | {
      isAuthenticated: true;
      type?: 'jwt' | 'eventBasic';
      userId?: number | string;
      eventId?: string;
      rawToken?: string;
      tokenPayload?: Record<string, unknown>;
    };

export type GraphQLContext = {
  prisma: AppPrismaClient;
  auth: GraphQLAuthContext;
  activationUrl: string;
  resetPasswordUrl: string;
  pubsub: typeof pubsub;
  request?: Request;
  requestId?: string;
};
