import { createRoute } from "@hono/zod-openapi";
import type { RouteConfig } from "@hono/zod-openapi";

import {
  healthResponseSchema,
  liveResponseSchema,
  readyResponseSchema,
} from "./health.schema.js";

const tags = ["Health"];

const liveRouteConfig = {
  path: "/health/live",
  method: "get",
  tags,
  summary: "Liveness probe",
  responses: {
    200: {
      description: "Process is alive",
      content: {
        "application/json": {
          schema: liveResponseSchema,
        },
      },
    },
  },
} satisfies RouteConfig;

const readyRouteConfig = {
  path: "/health/ready",
  method: "get",
  tags,
  summary: "Readiness probe",
  responses: {
    200: {
      description: "Service is ready",
      content: {
        "application/json": {
          schema: readyResponseSchema,
        },
      },
    },
    503: {
      description: "Service is not ready",
      content: {
        "application/json": {
          schema: readyResponseSchema,
        },
      },
    },
  },
} satisfies RouteConfig;

const healthRouteConfig = {
  path: "/health",
  method: "get",
  tags,
  summary: "Full health check",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: healthResponseSchema,
        },
      },
    },
    503: {
      description: "Service is unhealthy",
      content: {
        "application/json": {
          schema: healthResponseSchema,
        },
      },
    },
  },
} satisfies RouteConfig;

export const live = createRoute(liveRouteConfig);
export const ready = createRoute(readyRouteConfig);
export const health = createRoute(healthRouteConfig);

export type LiveRoute = typeof live;
export type ReadyRoute = typeof ready;
export type HealthRoute = typeof health;
