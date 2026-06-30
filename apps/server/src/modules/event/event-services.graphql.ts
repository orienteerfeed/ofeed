import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import { ResponseMessageRef } from '../graphql/graphql.graphql-types.js';
import { EventServiceSystemKeyRef } from './event-services.graphql-types.js';
import {
  deleteCustomEventServiceForGraphQL,
  listEventServiceSettings,
  saveCustomEventServiceForGraphQL,
  updateLateEntryFeePercentForGraphQL,
  updateSystemEventServiceForGraphQL,
  type EventServiceSetting,
  type EventServiceSettings,
} from './event-services.service.js';

const EventServiceSettingRef = builder
  .objectRef<EventServiceSetting>('EventServiceSetting')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id', { nullable: true }),
      systemKey: t.field({
        type: EventServiceSystemKeyRef,
        nullable: true,
        resolve: (service) => service.systemKey,
      }),
      active: t.exposeBoolean('active'),
      name: t.exposeString('name'),
      description: t.exposeString('description', { nullable: true }),
      price: t.exposeFloat('price', { nullable: true }),
      maxQuantity: t.exposeInt('maxQuantity', { nullable: true }),
      custom: t.exposeBoolean('custom'),
    }),
  });

const EventServiceSettingsRef = builder
  .objectRef<EventServiceSettings>('EventServiceSettings')
  .implement({
    fields: (t) => ({
      eventId: t.exposeString('eventId'),
      lateEntryFeePercent: t.exposeFloat('lateEntryFeePercent', { nullable: true }),
      services: t.expose('services', { type: [EventServiceSettingRef] }),
    }),
  });

const UpdateSystemEventServiceInputRef = builder.inputType('UpdateSystemEventServiceInput', {
  fields: (t) => ({
    eventId: t.string({ required: true }),
    systemKey: t.field({ type: EventServiceSystemKeyRef, required: true }),
    active: t.boolean({ required: true }),
    price: t.float({ required: false }),
  }),
});

const SaveCustomEventServiceInputRef = builder.inputType('SaveCustomEventServiceInput', {
  fields: (t) => ({
    eventId: t.string({ required: true }),
    id: t.int({ required: false }),
    active: t.boolean({ required: false }),
    name: t.string({ required: true }),
    description: t.string({ required: false }),
    price: t.float({ required: false }),
    maxQuantity: t.int({ required: false }),
  }),
});

builder.queryFields((t) => ({
  eventServiceSettings: t.field({
    type: EventServiceSettingsRef,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      listEventServiceSettings(context.prisma, context.auth, args.eventId),
  }),
}));

builder.mutationFields((t) => ({
  updateLateEntryFeePercent: t.field({
    type: ResponseMessageRef,
    args: {
      eventId: t.arg.string({ required: true }),
      lateEntryFeePercent: t.arg.float({ required: false }),
    },
    resolve: (_root, args, context) =>
      updateLateEntryFeePercentForGraphQL(
        context.prisma,
        context.auth,
        args.eventId,
        args.lateEntryFeePercent,
      ).catch((err: unknown) =>
        rethrowAuthzOrError(err, 'Failed to update late entry fee percent'),
      ),
  }),
  updateSystemEventService: t.field({
    type: ResponseMessageRef,
    args: {
      input: t.arg({ type: UpdateSystemEventServiceInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateSystemEventServiceForGraphQL(context.prisma, context.auth, {
        eventId: args.input.eventId,
        systemKey: args.input.systemKey,
        active: args.input.active,
        price: args.input.price,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update event service')),
  }),
  saveCustomEventService: t.field({
    type: EventServiceSettingRef,
    args: {
      input: t.arg({ type: SaveCustomEventServiceInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      saveCustomEventServiceForGraphQL(context.prisma, context.auth, {
        eventId: args.input.eventId,
        id: args.input.id,
        active: args.input.active ?? undefined,
        name: args.input.name,
        description: args.input.description,
        price: args.input.price,
        maxQuantity: args.input.maxQuantity,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to save event service')),
  }),
  deleteCustomEventService: t.field({
    type: ResponseMessageRef,
    args: {
      eventId: t.arg.string({ required: true }),
      id: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      deleteCustomEventServiceForGraphQL(context.prisma, context.auth, args.eventId, args.id).catch(
        (err: unknown) => rethrowAuthzOrError(err, 'Failed to delete event service'),
      ),
  }),
}));
