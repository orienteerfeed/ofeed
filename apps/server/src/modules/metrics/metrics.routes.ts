import { createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";

import { HTTP_STATUS } from "../../constants";

export const getMetrics = createRoute({
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
});

export type GetMetricsRoute = typeof getMetrics;
