import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import { ResponseMessageRef } from '../graphql/graphql.graphql-types.js';
import {
  createEventRentalCardForGraphQL,
  deleteAllEventRentalCardsForGraphQL,
  deleteEventRentalCardForGraphQL,
  listEventRentalCards,
  updateEventRentalCardForGraphQL,
  type EventRentalCard,
} from './event-rental-cards.service.js';

const EventRentalCardRef = builder.objectRef<EventRentalCard>('EventRentalCard').implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    cardNumber: t.exposeInt('cardNumber'),
    active: t.exposeBoolean('active'),
    returned: t.exposeBoolean('returned'),
    isLent: t.exposeBoolean('isLent'),
  }),
});

const CreateEventRentalCardInputRef = builder.inputType('CreateEventRentalCardInput', {
  fields: (t) => ({
    eventId: t.string({ required: true }),
    cardNumber: t.int({ required: true }),
    active: t.boolean({ required: false }),
  }),
});

const UpdateEventRentalCardInputRef = builder.inputType('UpdateEventRentalCardInput', {
  fields: (t) => ({
    eventId: t.string({ required: true }),
    id: t.int({ required: true }),
    active: t.boolean({ required: false }),
    returned: t.boolean({ required: false }),
  }),
});

builder.queryFields((t) => ({
  eventRentalCards: t.field({
    type: [EventRentalCardRef],
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      listEventRentalCards(context.prisma, context.auth, args.eventId),
  }),
}));

builder.mutationFields((t) => ({
  createEventRentalCard: t.field({
    type: EventRentalCardRef,
    args: {
      input: t.arg({ type: CreateEventRentalCardInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      createEventRentalCardForGraphQL(context.prisma, context.auth, {
        eventId: args.input.eventId,
        cardNumber: args.input.cardNumber,
        active: args.input.active ?? undefined,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to create rental card')),
  }),
  updateEventRentalCard: t.field({
    type: EventRentalCardRef,
    args: {
      input: t.arg({ type: UpdateEventRentalCardInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateEventRentalCardForGraphQL(context.prisma, context.auth, {
        eventId: args.input.eventId,
        id: args.input.id,
        active: args.input.active ?? undefined,
        returned: args.input.returned ?? undefined,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update rental card')),
  }),
  deleteEventRentalCard: t.field({
    type: ResponseMessageRef,
    args: {
      eventId: t.arg.string({ required: true }),
      id: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      deleteEventRentalCardForGraphQL(context.prisma, context.auth, args.eventId, args.id).catch(
        (err: unknown) => rethrowAuthzOrError(err, 'Failed to delete rental card'),
      ),
  }),
  deleteAllEventRentalCards: t.field({
    type: ResponseMessageRef,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      deleteAllEventRentalCardsForGraphQL(context.prisma, context.auth, args.eventId).catch(
        (err: unknown) => rethrowAuthzOrError(err, 'Failed to delete rental cards'),
      ),
  }),
}));
