import type { Context } from "hono";

import type { AppBindings } from "../../types/index.js";

import { collectDefaultMetrics, register } from "prom-client";

let defaultMetricsRegistered = false;

if (!defaultMetricsRegistered) {
  collectDefaultMetrics({ register });
  defaultMetricsRegistered = true;
}

export async function getMetricsHandler(c: Context<AppBindings>) {
  const metrics = await register.metrics();
  c.header("Content-Type", register.contentType);
  return c.text(metrics, 200);
}
