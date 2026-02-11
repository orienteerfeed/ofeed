import type { Context, Next } from "hono";

import { accessLogger } from "../lib/logging";
import { extractClientIp, sanitizeLogString, sanitizePath } from "../utils/sanitize";

export async function accessLoggerMiddleware(c: Context, next: Next) {
  const start = performance.now();

  await next();

  if (!accessLogger) {
    return;
  }

  const durationMs = Math.round(performance.now() - start);

  accessLogger.info({
    requestId: c.get("requestId"),
    method: c.req.method,
    path: sanitizePath(c.req.path),
    status: c.res.status,
    durationMs,
    ip: extractClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")),
    userAgent: sanitizeLogString(c.req.header("user-agent")),
  });
}
