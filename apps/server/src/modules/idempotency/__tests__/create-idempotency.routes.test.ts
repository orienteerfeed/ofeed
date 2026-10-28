import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([]),
    event: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    class: { findFirst: vi.fn() },
    idempotencyResponse: { deleteMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
  entry: vi.fn(),
  competitor: vi.fn(),
  status: vi.fn(),
}));
vi.mock('../../../utils/context.js', () => ({ default: mocks.prisma }));
vi.mock('../../entry/entry.service.js', async (original) => ({
  ...(await original<object>()),
  createEntryOrder: mocks.entry,
}));
vi.mock('../../event/event.service.js', async (original) => ({
  ...(await original<object>()),
  storeCompetitor: mocks.competitor,
  changeCompetitorStatus: mocks.status,
}));
import eventRouter from '../../event/event.routes.js';
import { idempotentCreate } from '../create-idempotency.js';
import type { AppPrismaClient } from '../../../db/prisma-client.js';

const rows = new Map<string, Record<string, unknown>>();
let owner = 1;
function app(userId: number | null = 1) {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (userId !== null)
      c.set(
        'authContext' as never,
        {
          isAuthenticated: true,
          type: 'jwt',
          userId,
        } as never,
      );
    await next();
  });
  app.route('/', eventRouter);
  return app;
}
const entryBody = {
  contactEmail: 'runner@example.test',
  contactFirstname: 'Test',
  contactLastname: 'Runner',
  paymentMethod: 'CASH',
  items: [{ classId: 1, firstname: 'Test', lastname: 'Runner', birthYear: 1990, card: 12345 }],
};
const cases = [
  { path: '/event-1/entries', body: entryBody, service: mocks.entry, status: 201 },
  {
    path: '/event-1/competitors',
    body: { origin: 'OFFICE', classExternalId: 'test', firstname: 'Test', lastname: 'Runner' },
    service: mocks.competitor,
    status: 200,
  },
  {
    path: '/event-1/competitors/1/status-change',
    body: { origin: 'START', status: 'Active' },
    service: mocks.status,
    status: 200,
  },
];
const request = (
  server: ReturnType<typeof app>,
  path: string,
  body: unknown,
  key: string | null = 'offline-retry',
) =>
  server.request(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key === null ? {} : { 'Idempotency-Key': key }),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  rows.clear();
  owner = 1;
  // Model serialized transactions and rollback; actual DB semantics have a separate integration suite.
  let previous: Promise<unknown> = Promise.resolve();
  mocks.prisma.$transaction.mockImplementation((action) => {
    const result = previous.then(async () => {
      const snapshot = new Map(rows);
      try {
        return await action(mocks.prisma);
      } catch (error) {
        rows.clear();
        for (const [key, row] of snapshot) rows.set(key, row);
        throw error;
      }
    });
    previous = result.catch(() => {});
    return result;
  });
  mocks.prisma.idempotencyResponse.findUnique.mockImplementation(
    ({ where }) => rows.get(where.id) ?? null,
  );
  mocks.prisma.idempotencyResponse.create.mockImplementation(({ data }) => {
    rows.set(data.id, data);
    return data;
  });
  mocks.prisma.idempotencyResponse.deleteMany.mockImplementation(({ where }) => {
    for (const [id, row] of rows)
      if (row.eventId === where.eventId && (row.expiresAt as Date) <= where.expiresAt.lte)
        rows.delete(id);
    return { count: 0 };
  });
  mocks.prisma.event.findUnique.mockImplementation(async () => ({ authorId: owner }));
  mocks.prisma.user.findUnique.mockResolvedValue({ role: 'USER' });
  mocks.prisma.class.findFirst.mockResolvedValue({ id: 1 });
  for (const service of [mocks.entry, mocks.competitor, mocks.status])
    service.mockResolvedValue({ id: 'created-once' });
});

describe.each(cases)('idempotency adapter $path', ({ path, body, service, status }) => {
  it('replays concurrent requests with identical status and JSON without another create', async () => {
    const server = app();
    const responses = await Promise.all([request(server, path, body), request(server, path, body)]);
    expect(responses.map((r) => r.status)).toEqual([status, status]);
    expect(await responses[0].text()).toBe(await responses[1].text());
    expect(responses[0].headers.get('content-type')).toBe(responses[1].headers.get('content-type'));
    expect(service).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    const txArg = service.mock.calls[0].at(-1);
    expect(txArg.tx).toBe(mocks.prisma);
    expect(txArg.afterCommit).toEqual([]);
  });
  it('rejects a different body without writing again', async () => {
    const server = app();
    expect((await request(server, path, body)).status).toBe(status);
    const changed = {
      ...body,
      ...(path.endsWith('status-change')
        ? { status: 'DidNotStart' }
        : { firstname: 'Other', contactFirstname: 'Other' }),
    };
    expect((await request(server, path, changed)).status).toBe(409);
    expect(service).toHaveBeenCalledTimes(1);
  });
  it('allows key reuse after expiry and leaves unkeyed requests independent', async () => {
    const server = app();
    await request(server, path, body);
    for (const row of rows.values()) row.expiresAt = new Date(0);
    expect((await request(server, path, body)).status).toBe(status);
    await request(server, path, body, null);
    await request(server, path, body, null);
    expect(service).toHaveBeenCalledTimes(4);
  });
  it('rejects invalid headers before a write', async () => {
    expect((await request(app(), path, body, 'a'.repeat(256))).status).toBe(422);
    expect((await request(app(), path, body, 'has spaces')).status).toBe(422);
    expect(service).not.toHaveBeenCalled();
  });
});

it('scopes keys to users, events, endpoints and competitors', async () => {
  for (const item of cases) await request(app(), item.path, item.body);
  await request(app(), '/event-1/competitors/2/status-change', cases[2].body);
  await request(app(), '/event-2/entries', entryBody);
  await request(app(2), '/event-1/entries', entryBody);
  await request(app(null), '/event-1/entries', entryBody);
  expect(rows.size).toBe(7);
});
it('reauthorizes before replaying a private response', async () => {
  const item = cases[1];
  await request(app(), item.path, item.body);
  owner = 2;
  expect((await request(app(), item.path, item.body)).status).toBe(403);
  expect((await request(app(null), item.path, item.body)).status).toBe(401);
  expect(mocks.competitor).toHaveBeenCalledTimes(1);
});
it('canonicalizes object property order', async () => {
  await request(app(), cases[1].path, cases[1].body);
  expect(
    (
      await request(
        app(),
        cases[1].path,
        Object.fromEntries(Object.entries(cases[1].body).reverse()),
      )
    ).status,
  ).toBe(200);
  expect(mocks.competitor).toHaveBeenCalledTimes(1);
});
it('does not cache failures and runs effects only after commit, once', async () => {
  const effect = vi.fn(() => {
    expect(rows.size).toBe(1);
  });
  const action = vi.fn(async (transaction) => {
    transaction.afterCommit.push(effect);
    return new Response('{"created":true}', { status: 201 });
  });
  const server = new Hono();
  server.post('/', (c) =>
    idempotentCreate(
      c,
      mocks.prisma as unknown as AppPrismaClient,
      {
        eventId: 'event-1',
        userId: null,
        operation: 'test',
        body: {},
      },
      action,
    ),
  );
  mocks.prisma.idempotencyResponse.create.mockRejectedValueOnce(new Error('storage failed'));
  expect((await request(server, '/', {})).status).toBe(500);
  expect(rows.size).toBe(0);
  expect(effect).not.toHaveBeenCalled();
  expect((await request(server, '/', {})).status).toBe(201);
  expect((await request(server, '/', {})).status).toBe(201);
  expect(effect).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledTimes(2);
});
it('rolls back error responses so the same key can succeed later', async () => {
  const server = new Hono();
  const action = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 422 }))
    .mockResolvedValue(new Response('{}', { status: 201 }));
  server.post('/', (c) =>
    idempotentCreate(
      c,
      mocks.prisma as unknown as AppPrismaClient,
      {
        eventId: 'event-1',
        userId: null,
        operation: 'test',
        body: {},
      },
      action,
    ),
  );
  expect((await request(server, '/', {})).status).toBe(422);
  expect(rows.size).toBe(0);
  expect((await request(server, '/', {})).status).toBe(201);
});

it('treats differently cased keys as independent operations', async () => {
  const item = cases[1];
  await request(app(), item.path, item.body, 'Retry-123');
  await request(app(), item.path, item.body, 'retry-123');
  expect(mocks.competitor).toHaveBeenCalledTimes(2);
  expect(rows.size).toBe(2);
});
