import { createRouter } from '../../lib/create-app.js';
import { requireJwtAuth } from '../../middlewares/require-jwt.js';
import { ConflictError, NotFoundError, ValidationError } from '../../exceptions/index.js';
import { isAuthzError } from '../../utils/authz.js';
import { error, success, validation } from '../../utils/responseApi.js';
import { createEntryPaymentSchema, entryPaymentQuerySchema } from './entry-payment.schema.js';
import {
  listEntryPayments,
  listPaymentInsights,
  recordEntryPayment,
} from './entry-payment.service.js';

const router = createRouter();

router.get('/:eventId/insights/payments', requireJwtAuth, async (c) => {
  try {
    const data = await listPaymentInsights(
      c.get('prisma'),
      c.get('authContext'),
      c.req.param('eventId'),
    );
    return c.json(success('Received payment insights', { data }), 200);
  } catch (cause) {
    const { message, status } = paymentError(cause);
    return c.json(error(message, status), status);
  }
});

function paymentError(cause: unknown) {
  if (isAuthzError(cause)) {
    const status = cause.statusCode === 404 ? 404 : cause.statusCode === 403 ? 403 : 401;
    return { message: cause.message, status } as const;
  }
  if (cause instanceof NotFoundError) return { message: cause.message, status: 404 } as const;
  if (cause instanceof ConflictError) return { message: cause.message, status: 409 } as const;
  if (cause instanceof ValidationError) return { message: cause.message, status: 422 } as const;
  throw cause;
}

router.post('/:eventId/entries/:entryId/payments', requireJwtAuth, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(error('Invalid JSON body', 400), 400);
  }
  const parsed = createEntryPaymentSchema.safeParse(body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const result = await recordEntryPayment(
      c.get('prisma'),
      c.get('authContext'),
      c.req.param('eventId'),
      c.req.param('entryId'),
      parsed.data,
    );
    const status = result.created ? 201 : 200;
    return c.json(success('Payment recorded', { data: result.payment }, status), status);
  } catch (cause) {
    const { message, status } = paymentError(cause);
    return c.json(error(message, status), status);
  }
});

router.get('/:eventId/payments', requireJwtAuth, async (c) => {
  const parsed = entryPaymentQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await listEntryPayments(
      c.get('prisma'),
      c.get('authContext'),
      c.req.param('eventId'),
      parsed.data,
    );
    return c.json(success('Event payments', { data }), 200);
  } catch (cause) {
    const { message, status } = paymentError(cause);
    return c.json(error(message, status), status);
  }
});

export default router;
