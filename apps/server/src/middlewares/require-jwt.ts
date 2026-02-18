import type { Context, MiddlewareHandler } from "hono";

import type { AppBindings } from "../types";

import { logger as fallbackLogger } from "../lib/logging";
import { error as errorResponse } from "../utils/responseApi.js";

type AuthContext = AppBindings["Variables"]["authContext"];

function logUnauthorizedRequest(
  c: Context<AppBindings>,
  authContext: AuthContext,
  mode: "jwt" | "jwt-or-basic",
) {
  const scopedLogger = (c.get("logger") as AppBindings["Variables"]["logger"] | undefined) ?? fallbackLogger;
  const failureReason = authContext?.failureReason ?? "unknown";
  const authHeader = c.req.header("authorization");

  scopedLogger.warn("Authorization rejected request", {
    requestId: c.get("requestId"),
    request: {
      method: c.req.method,
      path: c.req.path,
    },
    auth: {
      mode,
      failureReason,
      authType: authContext?.type ?? null,
      hasAuthorizationHeader: Boolean(authHeader),
    },
  });
}

function normalizeAuthenticatedUserId(authContext: AuthContext): number | string | undefined {
  if (!authContext?.isAuthenticated) {
    return undefined;
  }

  return authContext.userId;
}

function normalizeUserId(authContext: AuthContext): number | string | undefined {
  if (!authContext?.isAuthenticated || authContext.type !== "jwt") {
    return undefined;
  }

  return authContext.userId;
}

function normalizeNumericUserId(userId: number | string | undefined) {
  if (typeof userId === "number") {
    return Number.isFinite(userId) ? userId : undefined;
  }

  if (typeof userId === "string" && userId.trim() !== "") {
    const parsed = Number(userId);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function getJwtUserId(c: Context<AppBindings>) {
  return normalizeUserId(c.get("authContext"));
}

export function getJwtNumericUserId(c: Context<AppBindings>) {
  return normalizeNumericUserId(getJwtUserId(c));
}

export function getAuthenticatedUserId(c: Context<AppBindings>) {
  return normalizeAuthenticatedUserId(c.get("authContext"));
}

export const requireJwtAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const authContext = c.get("authContext");
  const userId = getJwtNumericUserId(c);

  if (!userId) {
    logUnauthorizedRequest(c, authContext, "jwt");
    return c.json(errorResponse("Unauthorized: Invalid or missing credentials.", 401), 401);
  }

  c.set("jwtUserId", userId);
  await next();
};

export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const authContext = c.get("authContext");
  const userId = getAuthenticatedUserId(c);

  if (!userId) {
    logUnauthorizedRequest(c, authContext, "jwt-or-basic");
    return c.json(errorResponse("Unauthorized: Invalid or missing credentials.", 401), 401);
  }

  await next();
};
