import type { Context, Schema } from 'hono';

import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';
import { rateLimiter } from 'hono-rate-limiter';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type { AppBindings, AppOpenAPI, RateLimitOptions } from '../types/index.js';

import { buildCSPHeaderValue, env, isCSPEnabled } from '../config/index.js';
import { API_DEFAULTS, HTTP_STATUS } from '../constants/index.js';
import { prisma } from '../db/prisma.js';
import { accessLoggerMiddleware } from '../middlewares/access-logger.js';
import { authMiddleware, isPublicPath } from '../middlewares/auth.middleware.js';
import { metricsMiddleware } from '../middlewares/metrics.middleware.js';
import { AUTH_OPENAPI } from '../modules/auth/auth.openapi.js';
import { EVENT_OPENAPI } from '../modules/event/event.openapi.js';
import { GRAPHQL_OPENAPI } from '../modules/graphql/graphql.openapi.js';
import { MAP_OPENAPI } from '../modules/map/map.openapi.js';
import { UPLOAD_OPENAPI } from '../modules/upload/upload.openapi.js';
import { structuredLogger } from '../middlewares/pino-logger.js';
import { error as errorResponse } from '../utils/responseApi.js';

import { logger } from './logging.js';

const authRateLimitPrefix = AUTH_OPENAPI.basePath;
const restApiPrefix = API_DEFAULTS.BASE_PATH;
const uploadBodyLimitPrefix = UPLOAD_OPENAPI.basePath;
const eventsBodyLimitPrefix = EVENT_OPENAPI.basePath;
const mapTilesRoutePrefix = `${MAP_OPENAPI.basePath}/tiles`;
const mapTilesPathPattern = `${MAP_OPENAPI.basePath}/tiles/*`;
const publicEventImagePathPattern = `${EVENT_OPENAPI.basePath}/:eventId/image`;
const defaultCorsMethods = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

function toRfc3339Timestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function shouldAttachMeta(path: string, contentType: string | null) {
  if (!path.startsWith(restApiPrefix)) {
    return false;
  }

  if (path.includes('/oauth2')) {
    return false;
  }

  return contentType?.toLowerCase().includes('application/json') ?? false;
}

function shouldUseUploadBodyLimit(path: string) {
  if (path.startsWith(uploadBodyLimitPrefix)) {
    return true;
  }

  const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
  const eventPrefix = `${eventsBodyLimitPrefix}/`;
  const imageSuffix = '/image';

  if (!normalizedPath.startsWith(eventPrefix) || !normalizedPath.endsWith(imageSuffix)) {
    return false;
  }

  const eventId = normalizedPath.slice(
    eventPrefix.length,
    normalizedPath.length - imageSuffix.length,
  );
  return eventId.length > 0 && !eventId.includes('/');
}

function mergeResponseMeta(c: Context<AppBindings>, payloadRecord: Record<string, unknown>) {
  const currentMeta = payloadRecord.meta;
  const nextMeta =
    currentMeta && typeof currentMeta === 'object' && !Array.isArray(currentMeta)
      ? { ...(currentMeta as Record<string, unknown>) }
      : {};

  if (typeof nextMeta.requestId !== 'string' || nextMeta.requestId.length === 0) {
    nextMeta.requestId = c.get('requestId') || randomUUID();
  }

  if (typeof nextMeta.timestamp !== 'string' || nextMeta.timestamp.length === 0) {
    nextMeta.timestamp = toRfc3339Timestamp();
  }

  return {
    ...payloadRecord,
    meta: nextMeta,
  };
}

function payloadTooLargeBody(c: Context<AppBindings>) {
  const payload: Record<string, unknown> = {
    message: 'Payload too large',
    error: true,
    code: HTTP_STATUS.CONTENT_TOO_LARGE,
  };

  if (!shouldAttachMeta(c.req.path, 'application/json')) {
    return payload;
  }

  return mergeResponseMeta(c, payload);
}

async function allowCrossOriginEmbeds(c: Context<AppBindings>, next: () => Promise<void>) {
  await next();
  c.header('Cross-Origin-Resource-Policy', 'cross-origin');
}

async function applyMapTileResourcePolicy(c: Context<AppBindings>, next: () => Promise<void>) {
  await next();
  c.header(
    'Cross-Origin-Resource-Policy',
    env.MAP_TILE_SESSION_REQUIRED ? 'same-origin' : 'cross-origin',
  );
}

function extractClientIp(c: { req: { header: (name: string) => string | undefined } }) {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim();
  }

  const directIp = c.req.header('cf-connecting-ip') ?? c.req.header('x-real-ip');
  if (directIp) {
    return directIp.trim();
  }

  const standardizedForwarded = c.req.header('forwarded');
  if (!standardizedForwarded) {
    return null;
  }

  const match = standardizedForwarded.match(/for=(?:"?\[?)([^;\],"]+)/i);
  return match?.[1]?.trim() ?? null;
}

function buildAnonymousRateLimitKey(c: { req: { header: (name: string) => string | undefined } }) {
  const fingerprintParts = [
    c.req.header('origin'),
    c.req.header('referer'),
    c.req.header('user-agent'),
    c.req.header('accept-language'),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (fingerprintParts.length === 0) {
    return 'anonymous';
  }

  const fingerprint = createHash('sha256').update(fingerprintParts.join('|')).digest('hex');

  return `fingerprint:${fingerprint}`;
}

function normalizeConfiguredCorsMethods(rawValue: string | undefined) {
  const configured = (rawValue ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  return Array.from(new Set([...defaultCorsMethods, ...configured]));
}

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
  app.use('*', accessLoggerMiddleware);
  app.use('*', structuredLogger);
  app.use('*', metricsMiddleware);

  const defaultBodyLimit = bodyLimit({
    maxSize: env.MAX_DEFAULT_BODY_SIZE_BYTES,
    onError: (c) =>
      c.json(payloadTooLargeBody(c as Context<AppBindings>), HTTP_STATUS.CONTENT_TOO_LARGE),
  });

  const uploadBodyLimit = bodyLimit({
    maxSize: env.MAX_UPLOAD_BODY_SIZE_BYTES,
    onError: (c) =>
      c.json(payloadTooLargeBody(c as Context<AppBindings>), HTTP_STATUS.CONTENT_TOO_LARGE),
  });

  app.use('*', async (c, next) => {
    if (shouldUseUploadBodyLimit(c.req.path)) {
      return uploadBodyLimit(c as never, next as never);
    }

    return defaultBodyLimit(c as never, next as never);
  });

  // Map tiles can run same-origin only in protected production deployments while remaining
  // cross-origin-friendly for local dev (3000 -> 3001).
  app.use(mapTilesPathPattern, applyMapTileResourcePolicy);
  app.use(publicEventImagePathPattern, allowCrossOriginEmbeds);
  app.use('*', secureHeaders());
  app.use('*', async (c, next) => {
    if (isCSPEnabled(env.NODE_ENV)) {
      const nonce = randomBytes(16).toString('base64');
      c.set('cspNonce', nonce);
      c.header('Content-Security-Policy', buildCSPHeaderValue(env.NODE_ENV, nonce));
    }

    await next();
  });

  if (env.ENABLE_COMPRESSION) {
    app.use('*', compress());
  }

  app.use('*', timing());
  app.use(
    '*',
    cors({
      origin: env.CORS_ORIGIN?.split(',') ?? ['*'],
      allowMethods: normalizeConfiguredCorsMethods(env.CORS_METHODS),
      allowHeaders: env.CORS_HEADERS?.split(',') ?? ['Content-Type', 'Authorization'],
      credentials: true,
    }),
  );

  app.use('*', authMiddleware);

  const keyGenerator = (c: { req: { header: (name: string) => string | undefined } }) => {
    return extractClientIp(c) ?? buildAnonymousRateLimitKey(c);
  };

  const defaultRateLimiter = rateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-6',
    keyGenerator,
  } as RateLimitOptions);

  const authRateLimiter = rateLimiter({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-6',
    keyGenerator,
  } as RateLimitOptions);

  const graphQLRateLimiter = rateLimiter({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-6',
    keyGenerator,
  } as RateLimitOptions);

  const mapTileRateLimiter = rateLimiter({
    windowMs: env.MAP_TILE_RATE_LIMIT_WINDOW_MS,
    limit: env.MAP_TILE_RATE_LIMIT_MAX,
    standardHeaders: 'draft-6',
    keyGenerator,
  } as RateLimitOptions);

  app.use('*', async (c, next) => {
    const path = c.req.path;

    if (path.startsWith(mapTilesRoutePrefix)) {
      return mapTileRateLimiter(c as never, next as never);
    }

    if (isPublicPath(path)) {
      await next();
      return;
    }

    if (path.startsWith(authRateLimitPrefix)) {
      return authRateLimiter(c as never, next as never);
    }

    if (path === GRAPHQL_OPENAPI.path) {
      return graphQLRateLimiter(c as never, next as never);
    }

    return defaultRateLimiter(c as never, next as never);
  });

  app.use('*', async (c, next) => {
    c.set('prisma', prisma);
    await next();
  });

  app.use('*', async (c, next) => {
    await next();

    if (!shouldAttachMeta(c.req.path, c.res.headers.get('content-type'))) {
      return;
    }

    if (c.res.status === HTTP_STATUS.NO_CONTENT) {
      return;
    }

    let payload: unknown;
    try {
      payload = await c.res.clone().json();
    } catch {
      return;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return;
    }

    const headers = new Headers(c.res.headers);
    headers.delete('content-length');

    c.res = new Response(JSON.stringify(mergeResponseMeta(c, payload as Record<string, unknown>)), {
      status: c.res.status,
      headers,
    });
  });

  app.notFound((c) =>
    c.json(errorResponse('404: Not found.', HTTP_STATUS.NOT_FOUND), HTTP_STATUS.NOT_FOUND),
  );

  app.onError((error, c) => {
    const requestId = c.get('requestId');
    const scopedLogger = c.get('logger');
    const message = error instanceof Error ? error.message : 'Unexpected server error';

    if (scopedLogger?.error) {
      scopedLogger.error('Unhandled server error', {
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
      logger.error('Unhandled server error', {
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
      errorResponse('Internal Server Error', HTTP_STATUS.INTERNAL_SERVER_ERROR),
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  });

  return app;
}

export function createTestApp<S extends Schema>(router: AppOpenAPI<S>) {
  return createApp().route('/', router);
}
