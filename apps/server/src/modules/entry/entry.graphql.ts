import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import { requireEventOwnerOrAdmin } from '../../utils/authz.js';
import { PaymentMethodTypeRef } from '../event/event-payment-methods.graphql-types.js';

import { EntryRef, EntryStatusRef } from './entry.graphql-types.js';
import {
  assignEntryItemRentalCardForGraphQL,
  entryOrderPaidUpdateForGraphQL,
  entryOrderProcessForGraphQL,
  entryOrderStatusUpdateForGraphQL,
  updateEntryOrderForGraphQL,
} from './entry.service.js';
import { hasEntryOrderAccess } from './entry-public-access.js';

const EntryOrderUpdateItemInputRef = builder.inputType('EntryOrderUpdateItemInput', {
  fields: (t) => ({
    classId: t.int({ required: true }),
    firstname: t.string({ required: true }),
    lastname: t.string({ required: true }),
    registration: t.string({ required: false }),
    birthYear: t.int({ required: false }),
    organisation: t.string({ required: false }),
    license: t.string({ required: false }),
    note: t.string({ required: false }),
    card: t.int({ required: false }),
    cardRental: t.boolean({ required: true }),
    startTime: t.field({ type: 'DateTime', required: false }),
  }),
});
const EntryOrderUpdateInputRef = builder.inputType('EntryOrderUpdateInput', {
  fields: (t) => ({
    contactEmail: t.string({ required: true }),
    contactFirstname: t.string({ required: true }),
    contactLastname: t.string({ required: true }),
    paymentMethod: t.field({ type: PaymentMethodTypeRef, required: true }),
    items: t.field({ type: [EntryOrderUpdateItemInputRef], required: true }),
  }),
});

builder.queryFields((t) => ({
  entryOrdersByEvent: t.prismaField({
    type: [EntryRef],
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      await requireEventOwnerOrAdmin(context.prisma, context.auth, args.eventId).catch(
        (err: unknown) => rethrowAuthzOrError(err, 'Failed to load entry orders'),
      );

      return context.prisma.entry.findMany({
        ...query,
        where: { eventId: args.eventId },
        orderBy: { createdAt: 'desc' },
      });
    },
  }),
  entryOrderById: t.prismaField({
    type: EntryRef,
    nullable: true,
    args: {
      entryId: t.arg.string({ required: true }),
      accessToken: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, context) => {
      const entry = await context.prisma.entry.findUnique({
        where: { id: args.entryId },
        select: { eventId: true },
      });
      if (!entry) return null;

      const hasSignedAccess =
        args.accessToken !== undefined &&
        args.accessToken !== null &&
        hasEntryOrderAccess(args.accessToken, args.entryId);
      if (!hasSignedAccess) {
        await requireEventOwnerOrAdmin(context.prisma, context.auth, entry.eventId).catch(
          (err: unknown) => rethrowAuthzOrError(err, 'Failed to load entry order'),
        );
      }

      return context.prisma.entry.findUnique({
        ...query,
        where: { id: args.entryId },
      });
    },
  }),
}));

builder.mutationFields((t) => ({
  entryOrderUpdate: t.prismaField({
    type: EntryRef,
    args: {
      entryId: t.arg.string({ required: true }),
      input: t.arg({ type: EntryOrderUpdateInputRef, required: true }),
    },
    resolve: async (query, _root, args, context) => {
      await updateEntryOrderForGraphQL(context.prisma, context.auth, {
        entryId: args.entryId,
        contactEmail: args.input.contactEmail,
        contactFirstname: args.input.contactFirstname,
        contactLastname: args.input.contactLastname,
        paymentMethod: args.input.paymentMethod,
        items: args.input.items.map((item) => ({
          classId: item.classId,
          firstname: item.firstname,
          lastname: item.lastname,
          registration: item.registration ?? undefined,
          birthYear: item.birthYear ?? undefined,
          organisation: item.organisation ?? undefined,
          license: item.license ?? undefined,
          note: item.note ?? undefined,
          card: item.card ?? undefined,
          cardRental: item.cardRental,
          startTime: item.startTime?.toISOString(),
        })),
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update entry order'));
      return context.prisma.entry.findUniqueOrThrow({ ...query, where: { id: args.entryId } });
    },
  }),
  entryOrderStatusUpdate: t.prismaField({
    type: EntryRef,
    args: {
      entryId: t.arg.string({ required: true }),
      status: t.arg({ type: EntryStatusRef, required: true }),
    },
    resolve: async (query, _root, args, context) => {
      await entryOrderStatusUpdateForGraphQL(context.prisma, context.auth, {
        entryId: args.entryId,
        status: args.status,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update entry order status'));

      return context.prisma.entry.findUniqueOrThrow({
        ...query,
        where: { id: args.entryId },
      });
    },
  }),
  entryOrderProcess: t.prismaField({
    type: EntryRef,
    args: {
      entryId: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      await entryOrderProcessForGraphQL(context.prisma, context.auth, {
        entryId: args.entryId,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to process entry order'));

      return context.prisma.entry.findUniqueOrThrow({
        ...query,
        where: { id: args.entryId },
      });
    },
  }),
  entryOrderPaidUpdate: t.prismaField({
    type: EntryRef,
    args: {
      entryId: t.arg.string({ required: true }),
      paid: t.arg.boolean({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      await entryOrderPaidUpdateForGraphQL(context.prisma, context.auth, {
        entryId: args.entryId,
        paid: args.paid,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update entry payment'));

      return context.prisma.entry.findUniqueOrThrow({
        ...query,
        where: { id: args.entryId },
      });
    },
  }),
  assignEntryItemRentalCard: t.prismaField({
    type: EntryRef,
    args: {
      entryItemId: t.arg.int({ required: true }),
      cardNumber: t.arg.int({ required: true }),
    },
    resolve: async (query, _root, args, context) => {
      const { entryId } = await assignEntryItemRentalCardForGraphQL(context.prisma, context.auth, {
        entryItemId: args.entryItemId,
        cardNumber: args.cardNumber,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to assign rental chip'));

      return context.prisma.entry.findUniqueOrThrow({
        ...query,
        where: { id: entryId },
      });
    },
  }),
}));
