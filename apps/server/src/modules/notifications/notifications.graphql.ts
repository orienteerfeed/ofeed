import { notificationKindSchema, type NotificationPage, type UserNotification } from '@repo/shared';
import { builder } from '../../graphql/builder.js';
import { pubsub, subscribeWithInitial } from '../../lib/pubsub.js';
import {
  listNotifications,
  markNotificationsRead,
  notificationTopic,
  requireInboxUser,
} from './notifications.service.js';

const NotificationKindRef = builder.enumType('NotificationKind', {
  values: notificationKindSchema.options,
});
const NotificationRef = builder.objectRef<UserNotification>('UserNotification').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.expose('kind', { type: NotificationKindRef }),
    eventId: t.exposeString('eventId'),
    entryId: t.exposeString('entryId', { nullable: true }),
    competitorId: t.int({ nullable: true, resolve: (row) => row.competitorId ?? null }),
    competitorName: t.string({ nullable: true, resolve: (row) => row.competitorName ?? null }),
    status: t.string({ nullable: true, resolve: (row) => row.status ?? null }),
    raceTime: t.int({ nullable: true, resolve: (row) => row.raceTime ?? null }),
    controlCode: t.int({ nullable: true, resolve: (row) => row.controlCode ?? null }),
    splitTime: t.int({ nullable: true, resolve: (row) => row.splitTime ?? null }),
    eventName: t.exposeString('eventName'),
    itemCount: t.exposeInt('itemCount', { nullable: true }),
    amount: t.exposeString('amount', { nullable: true }),
    currency: t.exposeString('currency', { nullable: true }),
    method: t.exposeString('method', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
    readAt: t.exposeString('readAt', { nullable: true }),
  }),
});
const PageRef = builder.objectRef<NotificationPage>('NotificationPage').implement({
  fields: (t) => ({
    notifications: t.field({ type: [NotificationRef], resolve: (page) => page.notifications }),
    unreadCount: t.exposeInt('unreadCount'),
    endCursor: t.exposeString('endCursor', { nullable: true }),
    hasNextPage: t.exposeBoolean('hasNextPage'),
  }),
});
builder.queryField('myNotifications', (t) =>
  t.field({
    type: PageRef,
    args: { first: t.arg.int({ defaultValue: 20 }), after: t.arg.string() },
    resolve: (_, args, ctx) =>
      listNotifications(ctx.prisma, ctx.auth, { first: args.first ?? 20, after: args.after }),
  }),
);
builder.mutationFields((t) => ({
  markNotificationRead: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: (_, args, ctx) => markNotificationsRead(ctx.prisma, ctx.auth, String(args.id)),
  }),
  markAllNotificationsRead: t.boolean({
    resolve: (_, __, ctx) => markNotificationsRead(ctx.prisma, ctx.auth),
  }),
}));
builder.subscriptionField('myNotificationsChanged', (t) =>
  t.boolean({
    subscribe: async (_, __, ctx) => {
      const userId = await requireInboxUser(ctx.prisma, ctx.auth);
      return subscribeWithInitial<boolean, boolean>(
        notificationTopic(userId),
        async () => true,
        () => true,
        pubsub,
      );
    },
    resolve: async (_, __, ctx) => {
      await requireInboxUser(ctx.prisma, ctx.auth);
      return true;
    },
  }),
);
