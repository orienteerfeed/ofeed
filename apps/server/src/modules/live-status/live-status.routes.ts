import { registerExternalDevice, requireEventPassword } from './live-status.external.js';
import { bodyLimit } from 'hono/body-limit';
import { heartbeats } from './live-status.metrics.js';
import { createRoute, z } from '@hono/zod-openapi';
import { rateLimiter } from 'hono-rate-limiter';
import { heartbeatSchema, externalLiveDeviceSchema } from '@repo/shared';
import { createRouter } from '../../lib/create-app.js';
import { error, success, validation } from '../../utils/responseApi.js';
import { isAuthzError } from '../../utils/authz.js';
import { ingestHeartbeat, tokenHash } from './live-status.service.js';

const router = createRouter();
router.use(
  '/:eventId/live-status/*',
  bodyLimit({ maxSize: 16384, onError: (c) => c.json(error('Heartbeat too large', 413), 413) }),
);
router.use(
  '/:eventId/live-status/*',
  rateLimiter({
    windowMs: 60_000,
    limit: 120,
    keyGenerator: (c) =>
      tokenHash(c.req.header('Authorization') ?? c.req.header('x-forwarded-for') ?? 'anonymous'),
  }),
);
// Parse before OpenAPI validation: malformed JSON otherwise throws an HTTPException
// that the application's generic error handler turns into a retriable 500.
router.use('/:eventId/live-status/*', async (c, next) => {
  try {
    await c.req.json();
  } catch (cause) {
    if (!(cause instanceof SyntaxError)) throw cause;
    return c.json(error('Invalid JSON body', 400), 400);
  }
  await next();
});
router.openapi(
  createRoute({
    method: 'post',
    path: '/{eventId}/live-status/heartbeat',
    tags: ['Live status'],
    security: [{ BearerAuth: [] }, { BasicAuth: [] }],
    request: {
      params: z.object({ eventId: z.string() }),
      body: { content: { 'application/json': { schema: heartbeatSchema } } },
    },
    responses: {
      200: { description: 'Durably recorded heartbeat' },
      400: { description: 'Malformed JSON body' },
      401: { description: 'Invalid device token' },
      409: { description: 'Monitoring inactive' },
      422: { description: 'Invalid heartbeat' },
    },
  }),
  async (c) => {
    try {
      const db = c.get('prisma');
      const payload: unknown = await c.req.json();
      const parsed = heartbeatSchema.safeParse(payload);
      if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
      const auth = c.get('authContext');
      let device;
      if (auth?.isAuthenticated && auth.type === 'eventBasic') {
        requireEventPassword(auth, c.req.param('eventId'));
        const identity = externalLiveDeviceSchema.safeParse(payload);
        if (!identity.success) return c.json(validation(identity.error.flatten()), 422);
        device = await registerExternalDevice(db, auth, c.req.param('eventId'), identity.data);
      } else {
        const raw = c.req.header('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
        if (!raw) return c.json(error('Device token or event password required', 401), 401);
        device = await db.liveDevice.findUnique({ where: { tokenHash: tokenHash(raw) } });
        if (!device || device.eventId !== c.req.param('eventId') || device.revokedAt)
          return c.json(error('Invalid device token', 401), 401);
      }
      const data = await ingestHeartbeat(db, device.id, parsed.data);
      return c.json(success('Heartbeat recorded', { data }), 200);
    } catch (cause) {
      heartbeats.inc({ outcome: 'error' });
      if (cause instanceof RangeError) return c.json(validation({ message: cause.message }), 422);
      if (isAuthzError(cause))
        return c.json(
          error(cause.message, cause.statusCode),
          cause.statusCode === 409 ? 409 : cause.statusCode === 403 ? 403 : 401,
        );
      throw cause;
    }
  },
);
router.openapi(
  createRoute({
    method: 'post',
    path: '/{eventId}/live-status/devices',
    tags: ['Live status'],
    security: [{ BasicAuth: [] }],
    request: {
      params: z.object({ eventId: z.string() }),
      body: { content: { 'application/json': { schema: externalLiveDeviceSchema } } },
    },
    responses: {
      200: { description: 'Application device registered (idempotent)' },
      400: { description: 'Invalid JSON' },
      401: { description: 'Event password required' },
      403: { description: 'Wrong event or revoked device' },
      422: { description: 'Invalid identity' },
    },
  }),
  async (c) => {
    try {
      const eventId = c.req.param('eventId');
      requireEventPassword(c.get('authContext'), eventId);
      const parsed = externalLiveDeviceSchema.safeParse(await c.req.json());
      if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
      const device = await registerExternalDevice(
        c.get('prisma'),
        c.get('authContext'),
        eventId,
        parsed.data,
      );
      return c.json(
        success('Device registered', {
          data: { deviceId: device.id, sourceType: device.sourceType, sourceId: device.sourceId },
        }),
        200,
      );
    } catch (cause) {
      if (isAuthzError(cause))
        return c.json(error(cause.message, cause.statusCode), cause.statusCode === 403 ? 403 : 401);
      throw cause;
    }
  },
);
export default router;
