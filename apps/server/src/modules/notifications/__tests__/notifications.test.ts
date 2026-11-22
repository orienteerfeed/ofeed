import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../../generated/prisma/client.js';
import { pubsub } from '../../../lib/pubsub.js';
import { schema } from '../../../graphql/schema.js';
import { enqueueUserNotification } from '../notifications.write.js';
import {
  encodeNotificationCursor,
  listNotifications,
  markNotificationsRead,
  requireInboxUser,
} from '../notifications.service.js';
import { cleanupNotifications, publishPendingNotifications } from '../notifications.worker.js';

const require = createRequire(import.meta.url);
const { graphql } = createRequire(require.resolve('@pothos/core'))(
  'graphql',
) as typeof import('graphql');
const auth = { isAuthenticated: true, type: 'jwt', userId: 7 } as const;
const now = new Date();
const row = {
  id: 'n-2',
  userId: 7,
  eventId: 'event',
  entryId: 'entry',
  kind: 'ENTRY_PAYMENT_RECEIVED',
  sourceKey: 'payment:receipt',
  eventName: 'Race',
  itemCount: null,
  amount: new Prisma.Decimal('100.29'),
  currency: 'CZK',
  method: 'CASH',
  createdAt: now,
  readAt: null,
  publishedAt: null,
};
function database() {
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ deletedAt: null }]),
    user: { findFirst: vi.fn().mockResolvedValue({ id: 7 }) },
    event: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ name: 'Race', authorId: 7, author: { deletedAt: null } }),
    },
    userNotification: {
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([row]),
      count: vi.fn().mockResolvedValue(2),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return db;
}
let db: ReturnType<typeof database>;
beforeEach(() => {
  db = database();
  vi.restoreAllMocks();
});

describe('personal inbox authorization and pagination', () => {
  it.each([
    { isAuthenticated: false, type: null },
    { isAuthenticated: true, type: 'eventBasic', userId: 7, eventId: 'event' },
    { isAuthenticated: true, type: 'jwt', userId: 'invalid' },
  ])('requires a user JWT: %j', async (actor) => {
    await expect(requireInboxUser(db as never, actor as never)).rejects.toThrow();
    expect(db.userNotification.findMany).not.toHaveBeenCalled();
  });
  it('rejects deleted/missing users', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(listNotifications(db as never, auth, {})).rejects.toThrow('unavailable');
  });
  it('paginates ties by ID, checks current ownership, and counts unread independently of the page', async () => {
    db.userNotification.findMany.mockResolvedValue([row, { ...row, id: 'n-1' }]);
    const after = encodeNotificationCursor({ ...row, id: 'n-3' });
    const page = await listNotifications(db as never, auth, { first: 1, after });
    expect(page).toMatchObject({
      unreadCount: 2,
      hasNextPage: true,
      notifications: [{ amount: '100.29', readAt: null }],
    });
    expect(page.endCursor).toBe(encodeNotificationCursor(row));
    expect(db.userNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 7,
          OR: expect.any(Array),
          AND: expect.any(Array),
        }),
        take: 2,
      }),
    );
    expect(db.userNotification.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 7, readAt: null }),
    });
  });
  it.each([{ first: 0 }, { first: 101 }, { after: 'broken' }])(
    'rejects malformed pagination %j',
    async (input) => {
      await expect(listNotifications(db as never, auth, input)).rejects.toThrow();
      expect(db.userNotification.findMany).not.toHaveBeenCalled();
    },
  );
  it('marks only the snapshot of owned unread IDs, preserving concurrent arrivals', async () => {
    vi.spyOn(pubsub, 'publish').mockResolvedValue();
    db.userNotification.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }] as never);
    await markNotificationsRead(db as never, auth);
    expect(db.userNotification.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 7,
        OR: expect.any(Array),
        readAt: null,
        id: { in: ['old-1', 'old-2'] },
      }),
      data: { readAt: expect.any(Date) },
    });
    expect(pubsub.publish).toHaveBeenCalledWith('USER_NOTIFICATIONS_7', true);
  });
  it('does not mutate an unknown/already read notification', async () => {
    db.userNotification.findMany.mockResolvedValue([]);
    await markNotificationsRead(db as never, auth, 'foreign');
    expect(db.userNotification.updateMany).not.toHaveBeenCalled();
  });
  it('exposes the typed GraphQL page and rejects anonymous access', async () => {
    const source =
      '{ myNotifications { unreadCount notifications { id kind amount readAt } hasNextPage } }';
    const result = await graphql({ schema, source, contextValue: { prisma: db, auth } });
    expect(result.errors).toBeUndefined();
    expect(result.data?.myNotifications).toMatchObject({
      unreadCount: 2,
      notifications: [{ id: 'n-2', amount: '100.29' }],
    });
    const denied = await graphql({
      schema,
      source,
      contextValue: { prisma: db, auth: { isAuthenticated: false, type: null } },
    });
    expect(denied.errors).toHaveLength(1);
  });
});

describe('transactional notification sources', () => {
  it('does not recreate an inbox when account erasure won the recipient lock', async () => {
    db.$queryRaw.mockResolvedValue([{ deletedAt: now }] as never);
    await enqueueUserNotification(db as never, 'event', {
      kind: 'ENTRY_ORDER_RECEIVED',
      entryId: 'entry',
      itemCount: 1,
    });
    expect(db.userNotification.createMany).not.toHaveBeenCalled();
  });
  it('uses separate source identities for orders and receipts and ignores replays', async () => {
    await enqueueUserNotification(db as never, 'event', {
      kind: 'ENTRY_ORDER_RECEIVED',
      entryId: 'entry',
      itemCount: 3,
    });
    await enqueueUserNotification(db as never, 'event', {
      kind: 'ENTRY_PAYMENT_RECEIVED',
      entryId: 'entry',
      paymentId: 'receipt',
      amount: row.amount,
      currency: 'CZK',
      method: 'CASH',
    });
    expect(db.userNotification.createMany.mock.calls.map((call) => call[0])).toEqual([
      {
        skipDuplicates: true,
        data: [expect.objectContaining({ sourceKey: 'order:entry', itemCount: 3, userId: 7 })],
      },
      {
        skipDuplicates: true,
        data: [
          expect.objectContaining({ sourceKey: 'payment:receipt', amount: row.amount, userId: 7 }),
        ],
      },
    ]);
  });
  it.each([null, { authorId: null }, { authorId: 7, author: { deletedAt: now } }])(
    'skips unavailable recipients: %j',
    async (event) => {
      db.event.findUnique.mockResolvedValue(event as never);
      await enqueueUserNotification(db as never, 'event', {
        kind: 'ENTRY_ORDER_RECEIVED',
        entryId: 'entry',
        itemCount: 1,
      });
      expect(db.userNotification.createMany).not.toHaveBeenCalled();
    },
  );
});

describe('publication and retention', () => {
  it('publishes invalidations without private payloads, then marks only the selected rows', async () => {
    const publish = vi.spyOn(pubsub, 'publish').mockResolvedValue();
    await publishPendingNotifications(db as never);
    expect(publish).toHaveBeenCalledWith('USER_NOTIFICATIONS_7', true);
    expect(db.userNotification.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['n-2'] }, publishedAt: null },
      data: { publishedAt: expect.any(Date) },
    });
  });
  it('keeps failed publications pending for retry', async () => {
    vi.spyOn(pubsub, 'publish').mockRejectedValue(new Error('bus down'));
    await expect(publishPendingNotifications(db as never)).rejects.toThrow('bus down');
    expect(db.userNotification.updateMany).not.toHaveBeenCalled();
  });
  it('deletes read and unread history after 90 days in bounded batches', async () => {
    await cleanupNotifications(db as never, new Date('2026-11-12T00:00:00Z'));
    expect(db.userNotification.findMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-08-14T00:00:00Z') } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    expect(db.userNotification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n-2'] } } });
  });
});
