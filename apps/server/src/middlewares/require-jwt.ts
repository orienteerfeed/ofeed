import type { Context, MiddlewareHandler } from "hono";

import type { AppBindings } from "../types";

import { error as errorResponse } from "../utils/responseApi.js";

type AuthContext = AppBindings["Variables"]["authContext"];

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

export function getJwtUserId(c: Context<AppBindings>) {
  return normalizeUserId(c.get("authContext"));
}

export function getAuthenticatedUserId(c: Context<AppBindings>) {
  return normalizeAuthenticatedUserId(c.get("authContext"));
}

export const requireJwtAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const userId = getJwtUserId(c);

  if (!userId) {
    return c.json(errorResponse("Unauthorized: Invalid or missing credentials.", 401), 401);
  }

  await next();
};

export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const userId = getAuthenticatedUserId(c);

  if (!userId) {
    return c.json(errorResponse("Unauthorized: Invalid or missing credentials.", 401), 401);
  }

  await next();
};
