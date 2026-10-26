import { createRouter } from '../../lib/create-app.js';
import { requireJwtAuth } from '../../middlewares/require-jwt.js';
import { error, success, validation } from '../../utils/responseApi.js';
import { isAuthzError } from '../../utils/authz.js';
import { punchBatchSchema } from './punch.schema.js';
import { ingestPunches, PunchConflictError } from './punch.service.js';

const router = createRouter();
router.post('/:eventId/punches', requireJwtAuth, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(error('Invalid JSON body', 400), 400);
  }
  const parsed = punchBatchSchema.safeParse(body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await ingestPunches(
      c.get('prisma'),
      c.get('authContext'),
      c.req.param('eventId'),
      parsed.data,
    );
    return c.json(success('Punches processed', { data }), 200);
  } catch (cause) {
    if (isAuthzError(cause)) {
      const status = cause.statusCode === 404 ? 404 : cause.statusCode === 403 ? 403 : 401;
      return c.json(error(cause.message, status), status);
    }
    if (cause instanceof PunchConflictError) return c.json(error(cause.message, 409), 409);
    throw cause;
  }
});
export default router;
