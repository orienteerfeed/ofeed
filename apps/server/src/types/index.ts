import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { Schema } from "hono";

import type { prisma } from "../db/prisma";
import type { LogContext, logger } from "../lib/logging";

export interface AuthContext {
  isAuthenticated: boolean;
  type: "jwt" | "eventBasic" | null;
  userId?: string;
  eventId?: string;
  rawToken?: string;
  tokenPayload?: Record<string, unknown>;
}

export interface AppBindings {
  Variables: {
    requestId: string;
    cspNonce: string;
    logger: typeof logger;
    logContext: LogContext;
    prisma: typeof prisma;
    authContext?: AuthContext;
  };
}

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
  standardHeaders: "draft-6";
  keyGenerator: (c: any) => string;
}

export type AppOpenAPI<S extends Schema = {}> = OpenAPIHono<AppBindings, S>;
export type AppRouteHandler<R extends RouteConfig> = RouteHandler<R, AppBindings>;
