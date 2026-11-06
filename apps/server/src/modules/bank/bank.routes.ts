import type { Context } from 'hono';

import { createRouter } from '../../lib/create-app.js';
import { getJwtNumericUserId, requireJwtAuth } from '../../middlewares/require-jwt.js';
import { ConflictError, NotFoundError, ValidationError } from '../../exceptions/index.js';
import { isAuthzError } from '../../utils/authz.js';
import { error, success, validation } from '../../utils/responseApi.js';
import {
  createBankConnection,
  listBankConnections,
  listConnectionBankTransactions,
  listEventBankTransactions,
  recordBankSyncReport,
  reportBankTransactions,
  revokeBankConnection,
  updateBankConnection,
} from './bank-connection.service.js';
import { ignoreBankTransaction, matchBankTransactionManually } from './bank-matching.js';
import {
  bankSyncReportSchema,
  bankTransactionBatchSchema,
  bankTransactionQuerySchema,
  createBankConnectionSchema,
  eventBankTransactionQuerySchema,
  manualMatchSchema,
  updateBankConnectionSchema,
} from './bank.schema.js';

function bankError(cause: unknown) {
  if (isAuthzError(cause)) {
    const status = cause.statusCode === 404 ? 404 : cause.statusCode === 403 ? 403 : 401;
    return { message: cause.message, status } as const;
  }
  if (cause instanceof NotFoundError) return { message: cause.message, status: 404 } as const;
  if (cause instanceof ConflictError) return { message: cause.message, status: 409 } as const;
  if (cause instanceof ValidationError) return { message: cause.message, status: 422 } as const;
  throw cause;
}

async function readJson(c: Context): Promise<{ body: unknown } | null> {
  try {
    return { body: await c.req.json() };
  } catch {
    return null;
  }
}

const ownerId = (c: Context) => getJwtNumericUserId(c) as number;

export const bankConnectionRoutes = createRouter();
bankConnectionRoutes.use('*', requireJwtAuth);

bankConnectionRoutes.post('/', async (c) => {
  const json = await readJson(c);
  if (!json) return c.json(error('Invalid JSON body', 400), 400);
  const parsed = createBankConnectionSchema.safeParse(json.body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  const { connection, created } = await createBankConnection(
    c.get('prisma'),
    ownerId(c),
    parsed.data,
  );
  const status = created ? 201 : 200;
  return c.json(success('Bank connection', { data: connection }, status), status);
});

bankConnectionRoutes.get('/', async (c) => {
  const data = await listBankConnections(c.get('prisma'), ownerId(c));
  return c.json(success('Bank connections', { data }), 200);
});

bankConnectionRoutes.patch('/:id', async (c) => {
  const json = await readJson(c);
  if (!json) return c.json(error('Invalid JSON body', 400), 400);
  const parsed = updateBankConnectionSchema.safeParse(json.body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await updateBankConnection(
      c.get('prisma'),
      ownerId(c),
      c.req.param('id'),
      parsed.data,
    );
    return c.json(success('Bank connection updated', { data }), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

bankConnectionRoutes.delete('/:id', async (c) => {
  try {
    const data = await revokeBankConnection(c.get('prisma'), ownerId(c), c.req.param('id'));
    return c.json(success('Bank connection revoked', { data }), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

bankConnectionRoutes.post('/:id/transactions', async (c) => {
  // G3 header contract; replays are safe through the per-item unique constraint.
  const key = c.req.header('Idempotency-Key');
  if (key !== undefined && !/^[\x21-\x7e]{1,255}$/.test(key)) {
    return c.json(
      validation('Idempotency-Key must contain 1–255 visible ASCII characters.', 422),
      422,
    );
  }
  const json = await readJson(c);
  if (!json) return c.json(error('Invalid JSON body', 400), 400);
  const parsed = bankTransactionBatchSchema.safeParse(json.body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await reportBankTransactions(
      c.get('prisma'),
      ownerId(c),
      c.req.param('id'),
      parsed.data.deviceId,
      parsed.data.transactions,
    );
    return c.json(success('Bank transactions processed', { data }), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

bankConnectionRoutes.post('/:id/sync-reports', async (c) => {
  const json = await readJson(c);
  if (!json) return c.json(error('Invalid JSON body', 400), 400);
  const parsed = bankSyncReportSchema.safeParse(json.body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await recordBankSyncReport(
      c.get('prisma'),
      ownerId(c),
      c.req.param('id'),
      parsed.data,
    );
    return c.json(success('Sync report recorded', { data }, 201), 201);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

bankConnectionRoutes.get('/:id/transactions', async (c) => {
  const parsed = bankTransactionQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const result = await listConnectionBankTransactions(
      c.get('prisma'),
      ownerId(c),
      c.req.param('id'),
      parsed.data,
    );
    return c.json(success('Bank transactions', result), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

export const bankTransactionRoutes = createRouter();
bankTransactionRoutes.use('*', requireJwtAuth);

bankTransactionRoutes.post('/:id/match', async (c) => {
  const json = await readJson(c);
  if (!json) return c.json(error('Invalid JSON body', 400), 400);
  const parsed = manualMatchSchema.safeParse(json.body);
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await matchBankTransactionManually(
      c.get('prisma'),
      ownerId(c),
      c.req.param('id'),
      parsed.data.entryId,
    );
    return c.json(success('Bank transaction matched', { data }), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

bankTransactionRoutes.post('/:id/ignore', async (c) => {
  try {
    const data = await ignoreBankTransaction(c.get('prisma'), ownerId(c), c.req.param('id'));
    return c.json(success('Bank transaction ignored', { data }), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

/** Mounted under the event router. */
export const eventBankTransactionRoutes = createRouter();

eventBankTransactionRoutes.get('/:eventId/bank-transactions', requireJwtAuth, async (c) => {
  const parsed = eventBankTransactionQuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(validation(parsed.error.flatten()), 422);
  try {
    const data = await listEventBankTransactions(
      c.get('prisma'),
      c.get('authContext'),
      c.req.param('eventId'),
      parsed.data,
    );
    return c.json(success('Event bank transactions', { data }), 200);
  } catch (cause) {
    const { message, status } = bankError(cause);
    return c.json(error(message, status), status);
  }
});

export default bankConnectionRoutes;
