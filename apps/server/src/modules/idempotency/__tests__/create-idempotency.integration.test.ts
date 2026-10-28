import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaClient } from '../../../db/prisma-client.js';
import { idempotentCreate } from '../create-idempotency.js';

const databaseUrl = process.env.IDEMPOTENCY_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !/^\/ofeed_idempotency_test(?:_|$)/.test(url.pathname)
  ) {
    throw new Error(
      'Idempotency integration tests require a local ofeed_idempotency_test database',
    );
  }
}

describe.skipIf(!databaseUrl)('create idempotency on disposable MariaDB', () => {
  const first = createPrismaClient(
    databaseUrl ?? 'mysql://root@127.0.0.1:13382/ofeed_idempotency_test',
  );
  const second = createPrismaClient(
    databaseUrl ?? 'mysql://root@127.0.0.1:13382/ofeed_idempotency_test',
  );
  let eventId: string;
  let userId: number;
  let sportId: number;
  const key = () => ({ 'Idempotency-Key': 'concurrent-offline-retry' });

  beforeEach(async () => {
    const user = await first.user.create({
      data: {
        email: `${randomUUID()}@idempotency.invalid`,
        firstname: 'Test',
        lastname: 'Operator',
        password: 'fixture-only',
      },
    });
    userId = user.id;
    const sport = await first.sport.create({ data: { name: `idempotency-${randomUUID()}` } });
    sportId = sport.id;
    const event = await first.event.create({
      data: {
        name: 'Idempotency fixture',
        date: new Date(),
        authorId: userId,
        sportId,
      },
    });
    eventId = event.id;
  });
  afterEach(async () => {
    await first.entry.deleteMany({ where: { eventId } });
    await first.event.delete({ where: { id: eventId } });
    await first.user.delete({ where: { id: userId } });
    await first.sport.delete({ where: { id: sportId } });
  });
  afterAll(async () => {
    await first.$disconnect();
    await second.$disconnect();
  });

  function server(db = first, fail: 'response' | 'storage' | null = null, effect = vi.fn()) {
    const app = new Hono();
    app.post('/', (c) =>
      idempotentCreate(
        c,
        db,
        {
          eventId,
          userId,
          operation: 'entries',
          body: { contactFirstname: 'Test' },
        },
        async (transaction) => {
          if (!transaction) throw new Error('Test requires a key');
          const entry = await transaction.tx.entry.create({
            data: {
              eventId,
              paymentReference: randomUUID().replaceAll('-', '').slice(0, 10),
              contactEmail: 'fixture@idempotency.invalid',
              contactFirstname: 'Test',
              contactLastname: 'Runner',
              totalAmount: 0,
              currency: 'CZK',
              paymentMethod: 'CASH',
            },
          });
          transaction.afterCommit.push(effect);
          if (fail === 'response') return c.json({ failure: true }, 422);
          if (fail === 'storage') {
            // Fail after the business write, exactly where response persistence can fail.
            throw new Error('simulated failure before response storage');
          }
          return c.json({ id: entry.id, secret: 'same-on-replay' }, 201);
        },
      ),
    );
    return app;
  }

  it('serializes concurrent creates across two database clients and replays after restart', async () => {
    const effect = vi.fn();
    const responses = await Promise.all(
      [first, second].map((db) =>
        server(db, null, effect).request('/', { method: 'POST', headers: key() }),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const body = await responses[0].text();
    expect(await responses[1].text()).toBe(body);
    expect(await first.entry.count({ where: { eventId } })).toBe(1);
    expect(await first.idempotencyResponse.count({ where: { eventId } })).toBe(1);
    expect(effect).toHaveBeenCalledTimes(1);
    const restarted = await server(second).request('/', { method: 'POST', headers: key() });
    expect(await restarted.text()).toBe(body);
  });
  it.each(['response', 'storage'] as const)(
    'rolls back the write and response after %s failure',
    async (failure) => {
      const effect = vi.fn();
      const failed = await server(first, failure, effect).request('/', {
        method: 'POST',
        headers: key(),
      });
      expect(failed.status).toBe(failure === 'response' ? 422 : 500);
      expect(await first.entry.count({ where: { eventId } })).toBe(0);
      expect(await first.idempotencyResponse.count({ where: { eventId } })).toBe(0);
      expect(effect).not.toHaveBeenCalled();
      expect((await server(second).request('/', { method: 'POST', headers: key() })).status).toBe(
        201,
      );
      expect(await first.entry.count({ where: { eventId } })).toBe(1);
    },
  );
  it('allows reuse after the exact expiry deadline and removes expired response data', async () => {
    await server().request('/', { method: 'POST', headers: key() });
    await first.idempotencyResponse.updateMany({
      where: { eventId },
      data: { expiresAt: new Date(0) },
    });
    expect((await server(second).request('/', { method: 'POST', headers: key() })).status).toBe(
      201,
    );
    expect(await first.entry.count({ where: { eventId } })).toBe(2);
    expect(await first.idempotencyResponse.count({ where: { eventId } })).toBe(1);
  });
});
