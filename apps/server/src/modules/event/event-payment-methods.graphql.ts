import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import {
  PaymentMethodConfigurationStatusRef,
  PaymentMethodTypeRef,
} from './event-payment-methods.graphql-types.js';
import {
  listEventPaymentMethods,
  updateEventPaymentMethods,
  type EventPaymentCapabilities,
  type EventPaymentMethodSetting,
  type EventPaymentMethodSettings,
} from './event-payment-methods.service.js';

const EventPaymentMethodRef = builder
  .objectRef<EventPaymentMethodSetting>('EventPaymentMethod')
  .implement({
    fields: (t) => ({
      type: t.field({ type: PaymentMethodTypeRef, resolve: (method) => method.type }),
      enabled: t.exposeBoolean('enabled'),
      position: t.exposeInt('position'),
      displayName: t.exposeString('displayName', { nullable: true }),
      paymentLinkTemplate: t.exposeString('paymentLinkTemplate', { nullable: true }),
      status: t.field({
        type: PaymentMethodConfigurationStatusRef,
        resolve: (method) => method.status,
      }),
    }),
  });

const EventPaymentCapabilitiesRef = builder
  .objectRef<EventPaymentCapabilities>('EventPaymentCapabilities')
  .implement({
    fields: (t) => ({
      ofeedPaymentAvailable: t.exposeBoolean('ofeedPaymentAvailable'),
      qrPaymentAvailable: t.exposeBoolean('qrPaymentAvailable'),
      bankAccountDisplay: t.exposeString('bankAccountDisplay', { nullable: true }),
      bankAccountIban: t.exposeString('bankAccountIban', { nullable: true }),
      bankAccountName: t.exposeString('bankAccountName', { nullable: true }),
    }),
  });

const EventPaymentMethodSettingsRef = builder
  .objectRef<EventPaymentMethodSettings>('EventPaymentMethodSettings')
  .implement({
    fields: (t) => ({
      eventId: t.exposeString('eventId'),
      paymentMethods: t.expose('paymentMethods', { type: [EventPaymentMethodRef] }),
      paymentCapabilities: t.expose('paymentCapabilities', {
        type: EventPaymentCapabilitiesRef,
      }),
    }),
  });

const EventPaymentMethodInputRef = builder.inputType('EventPaymentMethodInput', {
  fields: (t) => ({
    type: t.field({ type: PaymentMethodTypeRef, required: true }),
    enabled: t.boolean({ required: true }),
    position: t.int({ required: true }),
    displayName: t.string({ required: false }),
    paymentLinkTemplate: t.string({ required: false }),
  }),
});

const UpdateEventPaymentMethodsInputRef = builder.inputType('UpdateEventPaymentMethodsInput', {
  fields: (t) => ({
    paymentMethods: t.field({ type: [EventPaymentMethodInputRef], required: true }),
    bankAccountName: t.string({ required: false }),
    bankAccountIban: t.string({ required: false }),
  }),
});

builder.queryFields((t) => ({
  eventPaymentMethods: t.field({
    type: EventPaymentMethodSettingsRef,
    args: { eventId: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      listEventPaymentMethods(context.prisma, context.auth, args.eventId).catch((error: unknown) =>
        rethrowAuthzOrError(error, 'Failed to load event payment methods'),
      ),
  }),
}));

builder.mutationFields((t) => ({
  updateEventPaymentMethods: t.field({
    type: EventPaymentMethodSettingsRef,
    args: {
      eventId: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateEventPaymentMethodsInputRef, required: true }),
    },
    resolve: (_root, args, context) => {
      const bankAccount =
        args.input.bankAccountName !== undefined || args.input.bankAccountIban !== undefined
          ? {
              bankAccountName: args.input.bankAccountName,
              bankAccountIban: args.input.bankAccountIban,
            }
          : undefined;

      return updateEventPaymentMethods(context.prisma, context.auth, args.eventId, {
        paymentMethods: args.input.paymentMethods.map((method) => ({
          type: method.type!,
          enabled: method.enabled!,
          position: method.position!,
          displayName: method.displayName,
          paymentLinkTemplate: method.paymentLinkTemplate,
        })),
        bankAccount,
      }).catch((error: unknown) =>
        rethrowAuthzOrError(error, 'Failed to update event payment methods'),
      );
    },
  }),
}));
