import type { Schema } from "hono";

import { OpenAPIHono } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { contextStorage } from "hono/context-storage";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";
import { rateLimiter } from "hono-rate-limiter";
import { randomBytes } from "node:crypto";

import type { AppBindings, AppOpenAPI, RateLimitOptions } from "../types";

import { buildCSPHeaderValue, env, isCSPEnabled } from "../config";
import { HTTP_STATUS } from "../constants";
import { prisma } from "../db/prisma";
import { accessLoggerMiddleware } from "../middlewares/access-logger";
import { authMiddleware, isPublicPath } from "../middlewares/auth.middleware";
import { metricsMiddleware } from "../middlewares/metrics.middleware";
import { AUTH_OPENAPI } from "../modules/auth/auth.openapi";
import { GRAPHQL_OPENAPI } from "../modules/graphql/graphql.openapi";
import { structuredLogger } from "../middlewares/pino-logger";
import { error as errorResponse } from "../utils/responseApi.js";

import { logger } from "./logging";

const authRateLimitPrefix = AUTH_OPENAPI.basePath;

export function createRouter() {
  return new OpenAPIHono<AppBindings>({
    strict: false,
  });
}

export default function createApp() {
  const app = new OpenAPIHono<AppBindings>({
    strict: false,
  });

  app.use(requestId());
  app.use(contextStorage());
  app.use("*", accessLoggerMiddleware);
  app.use("*", structuredLogger);
  app.use("*", metricsMiddleware);

  app.use(
    "*",
    bodyLimit({
      maxSize: env.MAX_DEFAULT_BODY_SIZE_BYTES,
      onError: (c) => {
        return c.json(
          {
            message: "Payload too large",
            error: true,
            code: HTTP_STATUS.CONTENT_TOO_LARGE,
          },
          HTTP_STATUS.CONTENT_TOO_LARGE,
        );
      },
    }),
  );

  app.use("*", secureHeaders());
  app.use("*", async (c, next) => {
    if (isCSPEnabled(env.NODE_ENV)) {
      const nonce = randomBytes(16).toString("base64");
      c.set("cspNonce", nonce);
      c.header("Content-Security-Policy", buildCSPHeaderValue(env.NODE_ENV, nonce));
    }

    await next();
  });

  if (env.ENABLE_COMPRESSION) {
    app.use("*", compress());
  }

  app.use("*", timing());
  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGIN?.split(",") ?? ["*"],
      allowMethods: env.CORS_METHODS?.split(",") ?? ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: env.CORS_HEADERS?.split(",") ?? ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  app.use("*", authMiddleware);

  const keyGenerator = (c: { req: { header: (name: string) => string | undefined } }) => {
    const forwardedFor = c.req.header("x-forwarded-for");

    if (!forwardedFor) {
      return "anonymous";
    }

    return forwardedFor.split(",")[0].trim();
  };

  const defaultRateLimiter = rateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator,
  } as RateLimitOptions);

  const authRateLimiter = rateLimiter({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-6",
    keyGenerator,
  } as RateLimitOptions);

  const graphQLRateLimiter = rateLimiter({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-6",
    keyGenerator,
  } as RateLimitOptions);

  app.use("*", async (c, next) => {
    const path = c.req.path;

    if (isPublicPath(path)) {
      await next();
      return;
    }

    if (path.startsWith(authRateLimitPrefix)) {
      return authRateLimiter(c, next);
    }

    if (path === GRAPHQL_OPENAPI.path) {
      return graphQLRateLimiter(c, next);
    }

    return defaultRateLimiter(c, next);
  });

  app.use("*", async (c, next) => {
    c.set("prisma", prisma);
    await next();
  });

  app.notFound((c) => c.json(errorResponse("404: Not found.", HTTP_STATUS.NOT_FOUND), HTTP_STATUS.NOT_FOUND));

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    const scopedLogger = c.get("logger");
    const message = error instanceof Error ? error.message : "Unexpected server error";

    if (scopedLogger?.error) {
      scopedLogger.error("Unhandled server error", {
        requestId,
        request: {
          method: c.req.method,
          path: c.req.path,
        },
        error: {
          message,
        },
      });
    } else {
      logger.error("Unhandled server error", {
        requestId,
        request: {
          method: c.req.method,
          path: c.req.path,
        },
        error: {
          message,
        },
      });
    }

    return c.json(
      errorResponse("Internal Server Error", HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  return app;
}

export function createTestApp<S extends Schema>(router: AppOpenAPI<S>) {
  return createApp().route("/", router);
}
