import { createHash } from 'node:crypto';
import type { Context } from 'hono';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { eventPunchTransaction } from '../punch/punch-write.js';
import { error, validation } from '../../utils/responseApi.js';

export type CreateTransaction = {
  tx: Prisma.TransactionClient;
  afterCommit: Array<() => void | Promise<void>>;
};

type Identity = {
  eventId: string;
  userId: number | null;
  operation: string;
  body: unknown;
};

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');

class FailedCreate extends Error {
  constructor(readonly response: Response) {
    super('Create failed; roll back the transaction');
  }
}

/** Call after validation and authorization, before any mutation of the input. */
export async function idempotentCreate(
  c: Context,
  prisma: AppPrismaClient,
  identity: Identity,
  action: (transaction?: CreateTransaction) => Promise<Response>,
): Promise<Response> {
  const key = c.req.header('Idempotency-Key');
  if (key === undefined) return action();
  if (!/^[\x21-\x7e]{1,255}$/.test(key)) {
    return c.json(
      validation('Idempotency-Key must contain 1–255 visible ASCII characters.', 422),
      422,
    );
  }

  const { eventId, userId, operation, body } = identity;
  const id = digest([eventId, userId, operation, key]);
  const requestHash = digest(body);
  let effects: CreateTransaction['afterCommit'] = [];
  let response: Response;
  try {
    response = await eventPunchTransaction(prisma, eventId, async (tx) => {
      // Reset effects on transaction retry. Never publish uncommitted work.
      const transaction: CreateTransaction = { tx, afterCommit: [] };
      effects = transaction.afterCommit;
      const now = new Date();
      await tx.idempotencyResponse.deleteMany({ where: { eventId, expiresAt: { lte: now } } });
      const stored = await tx.idempotencyResponse.findUnique({ where: { id } });
      if (stored) {
        if (stored.requestHash !== requestHash) {
          return c.json(
            error('Idempotency-Key was already used with a different request body.', 409),
            409,
          );
        }
        return new Response(stored.body, {
          status: stored.status,
          headers: { 'content-type': stored.contentType },
        });
      }
      const result = await action(transaction);
      if (!result.ok) throw new FailedCreate(result);
      await tx.idempotencyResponse.create({
        data: {
          id,
          eventId,
          requestHash,
          status: result.status,
          contentType: result.headers.get('content-type') ?? 'application/json',
          body: await result.clone().text(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return result;
    });
  } catch (err) {
    if (err instanceof FailedCreate) return err.response;
    throw err;
  }
  for (const effect of effects) {
    try {
      await effect();
    } catch (err) {
      // The write and response are committed; delivery failure cannot undo them.
      console.error('Create post-commit notification failed', err);
    }
  }
  return response;
}
