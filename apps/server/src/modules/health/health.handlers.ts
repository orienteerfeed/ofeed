import type { Context } from "hono";

import type { AppBindings } from "../../types";

import { logEndpoint } from "../../lib/http/endpoint-logger.js";
import { performFullHealthCheck, performReadinessCheck } from "./health.service";

export function liveHandler(c: Context<AppBindings>) {
  c.header("Cache-Control", "no-store");
  return c.json(
    {
      status: "alive",
      timestamp: new Date().toISOString(),
    },
    200,
  );
}

export async function readyHandler(c: Context<AppBindings>) {
  c.header("Cache-Control", "no-store");

  const prisma = c.get("prisma");
  const { ready, checks } = await performReadinessCheck(prisma);

  if (ready) {
    return c.json(
      {
        status: "ready",
        checks,
      },
      200,
    );
  }

  c.header("Retry-After", "30");
  logEndpoint(c, "warn", "Readiness check reported not ready", { checks });

  return c.json(
    {
      status: "not_ready",
      checks,
    },
    503,
  );
}

export async function healthHandler(c: Context<AppBindings>) {
  c.header("Cache-Control", "no-store");

  const prisma = c.get("prisma");
  const result = await performFullHealthCheck(prisma);

  if (result.status === "UP") {
    return c.json(result, 200);
  }

  c.header("Retry-After", "30");
  logEndpoint(c, "warn", "Health check reported degraded status", { resultStatus: result.status });

  return c.json(result, 503);
}
