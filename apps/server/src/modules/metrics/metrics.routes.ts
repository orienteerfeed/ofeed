import { createRoute, z } from "@hono/zod-openapi";
import type { RouteConfig } from "@hono/zod-openapi";

import { HTTP_STATUS } from "../../constants/index.js";

const getMetricsRouteConfig = {
  tags: ["Monitoring"],
  method: "get",
  path: "/metrics",
  summary: "Get Prometheus metrics",
  description: "Endpoint for Prometheus to scrape application metrics",
  responses: {
    [HTTP_STATUS.OK]: {
      description: "Prometheus metrics in plain text format",
      content: {
        "text/plain": {
          schema: z.string(),
        },
      },
    },
  },
} satisfies RouteConfig;

export const getMetrics = createRoute(getMetricsRouteConfig);

export type GetMetricsRoute = typeof getMetrics;
