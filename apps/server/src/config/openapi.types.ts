import type { RouteConfig } from "@hono/zod-openapi";

export type OpenApiMethod = RouteConfig["method"];

export type OpenApiOperation = Omit<RouteConfig, "method" | "path">;

export type OpenApiPathItem = Partial<Record<OpenApiMethod, OpenApiOperation>>;
