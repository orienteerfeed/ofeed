import type { outputShapeKey } from '@pothos/core';

import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';

import {
  findEventsConnection,
  findEventById,
  findEventsBySport,
  findEventsByUser,
  searchPublishedEvents,
  subscribeWinnerUpdated,
  type EventConnection,
  type EventVisibilityUpdateResult,
  type WinnerNotification,
  updateEventVisibility,
} from './event.service.js';
import { EventRef } from './event.graphql-types.js';
import { eventsInputSchema } from './event.schema.js';

type OutputShapeOf<Ref> = Ref extends { [outputShapeKey]: infer Shape } ? Shape : never;
type EventGraphQLShape = OutputShapeOf<typeof EventRef>;

const EventFilterRef = builder.enumType('EventFilter', {
  values: ['ALL', 'TODAY', 'UPCOMING', 'RECENT'] as const,
});

const EventsInputRef = builder.inputType('EventsInput', {
  fields: (t) => ({
    filter: t.field({ type: EventFilterRef }),
    sportId: t.int(),
    search: t.string(),
    first: t.int(),
    after: t.string(),
  }),
});

const WinnerNotificationRef = builder
  .objectRef<WinnerNotification>('WinnerNotification')
  .implement({
    fields: (t) => ({
      eventId: t.exposeString('eventId'),
      classId: t.exposeInt('classId'),
      className: t.exposeString('className'),
      name: t.exposeString('name'),
    }),
  });

const EventEdgeRef = builder.objectRef<EventConnection['edges'][number]>('EventEdge').implement({
  fields: (t) => ({
    node: t.field({
      type: EventRef,
      resolve: (edge) => edge.node as EventGraphQLShape,
    }),
    cursor: t.exposeString('cursor'),
  }),
});

const PageInfoRef = builder.objectRef<EventConnection['pageInfo']>('PageInfo').implement({
  fields: (t) => ({
    hasNextPage: t.exposeBoolean('hasNextPage'),
    hasPreviousPage: t.exposeBoolean('hasPreviousPage'),
    startCursor: t.exposeString('startCursor', { nullable: true }),
    endCursor: t.exposeString('endCursor', { nullable: true }),
  }),
});

const EventConnectionRef = builder.objectRef<EventConnection>('EventConnection').implement({
  fields: (t) => ({
    edges: t.expose('edges', { type: [EventEdgeRef] }),
    pageInfo: t.expose('pageInfo', { type: PageInfoRef }),
  }),
});

const EventResponseRef = builder.objectRef<EventVisibilityUpdateResult>('EventResponse').implement({
  fields: (t) => ({
    message: t.string({
      resolve: (response) => response.message,
    }),
    event: t.field({
      type: EventRef,
      nullable: true,
      resolve: (response) => response.event,
    }),
  }),
});

builder.queryFields((t) => ({
  events: t.field({
    type: EventConnectionRef,
    args: {
      input: t.arg({ type: EventsInputRef }),
    },
    resolve: (_root, args, context) =>
      findEventsConnection(context.prisma, eventsInputSchema.parse(args.input ?? {})),
  }),
  event: t.prismaField({
    type: EventRef,
    nullable: true,
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      findEventById(context.prisma, args.id as string, query),
  }),
  eventsBySport: t.prismaField({
    type: [EventRef],
    nullable: true,
    args: {
      sportId: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      findEventsBySport(context.prisma, args.sportId as number, query),
  }),
  eventsByUser: t.prismaField({
    type: [EventRef],
    nullable: true,
    args: {
      userId: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      findEventsByUser(context.prisma, args.userId as number, query),
  }),
  searchEvents: t.field({
    type: [EventRef],
    nullable: { list: false, items: true },
    args: {
      query: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) => searchPublishedEvents(context.prisma, args.query as string),
  }),
}));

builder.mutationFields((t) => ({
  updateEventVisibility: t.field({
    type: EventResponseRef,
    args: {
      eventId: t.arg.string({ required: true }),
      published: t.arg.boolean({ required: true }),
    },
    resolve: (_root, args, context) =>
      updateEventVisibility(
        context.prisma,
        context.auth,
        args.eventId as string,
        args.published as boolean,
      ).catch((err: unknown) =>
        rethrowAuthzOrError(err, 'Failed to update event visibility.'),
      ),
  }),
}));

builder.subscriptionFields((t) => ({
  winnerUpdated: t.field({
    type: WinnerNotificationRef,
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args, context) =>
      subscribeWinnerUpdated(args.eventId as string, context.pubsub),
    resolve: (payload) => payload.winnerUpdated,
  }),
}));
