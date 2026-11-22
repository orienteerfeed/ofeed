import {
  notificationPageInputSchema,
  type NotificationPage,
  type UserNotification,
} from '@repo/shared';
import { z } from 'zod';
import type { AppPrismaClient } from '../../db/prisma-client.js';
import type { Prisma, UserNotification as Row } from '../../generated/prisma/client.js';
import type { GraphQLAuthContext } from '../../graphql/context.types.js';
import { AuthzError } from '../../utils/authz.js';
import { ValidationError } from '../../exceptions/index.js';
import { pubsub } from '../../lib/pubsub.js';

export const notificationTopic = (userId: number) => `USER_NOTIFICATIONS_${userId}`;
export const RETENTION_DAYS = 90;

export async function requireInboxUser(db: AppPrismaClient, auth: GraphQLAuthContext) {
  const userId = auth.isAuthenticated && auth.type === 'jwt' ? Number(auth.userId) : NaN;
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new AuthzError('User JWT required', 401);
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new AuthzError('User unavailable', 401);
  return userId;
}

export function visibleNotifications(
  userId: number,
  now = new Date(),
): Prisma.UserNotificationWhereInput {
  return {
    userId,
    user: { deletedAt: null },
    OR: [
      {
        kind: { in: ['ENTRY_ORDER_RECEIVED', 'ENTRY_PAYMENT_RECEIVED'] },
        event: { authorId: userId },
      },
      {
        kind: { notIn: ['ENTRY_ORDER_RECEIVED', 'ENTRY_PAYMENT_RECEIVED'] },
        event: { published: true },
        OR: [{ competitor: { favorites: { some: { userId } } } }, { athleteFollow: { userId } }],
      },
    ],
    createdAt: { gte: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) },
  };
}

const cursorSchema = z.object({ createdAt: z.string().datetime(), id: z.string().min(1).max(191) });
export function encodeNotificationCursor(row: { createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
  ).toString('base64url');
}
function decodeCursor(cursor: string) {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ValidationError('Invalid notification cursor');
  }
}
function serialize(row: Row): UserNotification {
  return {
    id: row.id,
    kind: row.kind,
    eventId: row.eventId,
    entryId: row.entryId,
    competitorId: row.competitorId ?? null,
    competitorName: row.competitorName ?? null,
    status: row.status ?? null,
    raceTime: row.raceTime ?? null,
    controlCode: row.controlCode ?? null,
    splitTime: row.splitTime ?? null,
    eventName: row.eventName,
    itemCount: row.itemCount,
    amount: row.amount?.toFixed(2) ?? null,
    currency: row.currency,
    method: row.method,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export async function listNotifications(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  input: unknown,
): Promise<NotificationPage> {
  const userId = await requireInboxUser(db, auth);
  const parsed = notificationPageInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid notification pagination');
  const { first, after } = parsed.data;
  const cursor = after ? decodeCursor(after) : null;
  const scope = visibleNotifications(userId);
  const [rows, unreadCount] = await db.$transaction([
    db.userNotification.findMany({
      where: {
        ...scope,
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: new Date(cursor.createdAt) } },
                    { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: first + 1,
    }),
    db.userNotification.count({ where: { ...scope, readAt: null } }),
  ]);
  const page = rows.slice(0, first);
  return {
    notifications: page.map(serialize),
    unreadCount,
    hasNextPage: rows.length > first,
    endCursor: page.length ? encodeNotificationCursor(page[page.length - 1]) : null,
  };
}

export async function markNotificationsRead(
  db: AppPrismaClient,
  auth: GraphQLAuthContext,
  id?: string,
) {
  const now = new Date();
  const userId = await requireInboxUser(db, auth);
  // Snapshot IDs first: inserts racing this operation must remain unread, even
  // when their database timestamps happen to share the same millisecond.
  const rows = await db.userNotification.findMany({
    where: {
      ...visibleNotifications(userId, now),
      createdAt: { gte: new Date(now.getTime() - RETENTION_DAYS * 86_400_000), lte: now },
      readAt: null,
      ...(id ? { id } : {}),
    },
    select: { id: true },
  });
  for (let offset = 0; offset < rows.length; offset += 1000) {
    await db.userNotification.updateMany({
      where: {
        ...visibleNotifications(userId, now),
        readAt: null,
        id: { in: rows.slice(offset, offset + 1000).map((row) => row.id) },
      },
      data: { readAt: now },
    });
  }
  await pubsub.publish(notificationTopic(userId), true);
  return true;
}
