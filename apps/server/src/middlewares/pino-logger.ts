import type { Context, Next } from "hono";

import type { LogContext } from "../lib/logging";

import { logger } from "../lib/logging";
import { extractClientIp, sanitizeLogString } from "../utils/sanitize";

declare module "hono" {
  interface ContextVariableMap {
    logger: typeof logger;
    logContext: LogContext;
  }
}

export async function structuredLogger(c: Context, next: Next) {
  const requestId = c.get("requestId") as string | undefined;

  const logContext: LogContext = {
    requestId,
    request: {
      method: c.req.method,
      path: c.req.path,
      userAgent: sanitizeLogString(c.req.header("user-agent")),
      ip: extractClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")),
    },
  };

  c.set("logger", logger);
  c.set("logContext", logContext);

  const start = Date.now();
  await next();

  c.set("logContext", {
    ...logContext,
    response: {
      statusCode: c.res.status,
      responseTime: Date.now() - start,
    },
  });
}
