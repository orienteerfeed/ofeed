import type { Context } from "hono";

import type { AppBindings } from "../../types";
import type { LogContext } from "../logging";

import { logger as appLogger } from "../logging";

type EndpointLogLevel = "info" | "warn" | "error";

function resolveLogContext(c: Context<AppBindings>, details?: Record<string, unknown>): LogContext {
  let context: LogContext = {
    requestId: c.get("requestId"),
    request: {
      method: c.req.method,
      path: c.req.path,
    },
  };

  try {
    const scopedContext = c.get("logContext");
    if (scopedContext && typeof scopedContext === "object") {
      context = scopedContext as LogContext;
    }
  } catch {
    // Keep fallback context.
  }

  if (!details) {
    return context;
  }

  return {
    ...context,
    endpoint: details,
  };
}

function resolveLogger(c: Context<AppBindings>) {
  try {
    const scopedLogger = c.get("logger");
    if (
      scopedLogger &&
      typeof scopedLogger.info === "function" &&
      typeof scopedLogger.warn === "function" &&
      typeof scopedLogger.error === "function"
    ) {
      return scopedLogger;
    }
  } catch {
    // Fallback to app logger.
  }

  return appLogger;
}

export function logEndpoint(
  c: Context<AppBindings>,
  level: EndpointLogLevel,
  message: string,
  details?: Record<string, unknown>,
) {
  const scopedLogger = resolveLogger(c);
  scopedLogger[level](message, resolveLogContext(c, details));
}

export function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  if (typeof error === "string") {
    return {
      errorMessage: error,
    };
  }

  return {
    errorMessage: "Unknown error",
  };
}
