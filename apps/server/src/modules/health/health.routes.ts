import { createRoute } from '@hono/zod-openapi';
import type { RouteConfig } from '@hono/zod-openapi';

import { healthzResponseSchema, readyResponseSchema } from './health.schema.js';

const tags = ['Health'];

const healthzRouteConfig = {
  path: '/healthz',
  method: 'get',
  tags,
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'Process is alive',
      content: {
        'application/json': {
          schema: healthzResponseSchema,
        },
      },
    },
  },
} satisfies RouteConfig;

const readyzRouteConfig = {
  path: '/readyz',
  method: 'get',
  tags,
  summary: 'Readiness probe',
  responses: {
    200: {
      description: 'Service is ready',
      content: {
        'application/json': {
          schema: readyResponseSchema,
        },
      },
    },
    503: {
      description: 'Service is not ready',
      content: {
        'application/json': {
          schema: readyResponseSchema,
        },
      },
    },
  },
} satisfies RouteConfig;

export const healthz = createRoute(healthzRouteConfig);
export const readyz = createRoute(readyzRouteConfig);

export type HealthzRoute = typeof healthz;
export type ReadyzRoute = typeof readyz;
