import { GraphQLError } from 'graphql';
import { ValidationError } from '../../exceptions/index.js';
import { builder } from '../../graphql/builder.js';
import { rethrowAuthzOrError } from '../../graphql/errors.js';
import { ResponseMessageRef } from '../graphql/graphql.graphql-types.js';
import {
  createPromoCode,
  listPromoCodes,
  quoteEntryPromoCode,
  revokePromoCode,
} from './promo-code.service.js';

const PromoCodeRef = builder
  .objectRef<Awaited<ReturnType<typeof listPromoCodes>>[number]>('PromoCode')
  .implement({
    fields: (t) => ({
      id: t.exposeString('id'),
      code: t.exposeString('code'),
      discountPercent: t.float({
        resolve: (value) => value.discountPercent.toNumber(),
      }),
      createdAt: t.expose('createdAt', { type: 'DateTime' }),
      revokedAt: t.expose('revokedAt', { type: 'DateTime', nullable: true }),
      usageCount: t.int({ resolve: (value) => value._count.entries }),
    }),
  });
const QuoteItemRef = builder.inputType('EntryPromoQuoteItemInput', {
  fields: (t) => ({
    classId: t.int({ required: true }),
    firstname: t.string({ required: true }),
    lastname: t.string({ required: true }),
    registration: t.string(),
    birthYear: t.int(),
    organisation: t.string(),
    license: t.string(),
    note: t.string(),
    card: t.int(),
    cardRental: t.boolean({ required: true }),
    startTime: t.string(),
  }),
});
type Quote = Awaited<ReturnType<typeof quoteEntryPromoCode>>;
const QuoteRef = builder.objectRef<Quote>('EntryPromoQuote').implement({
  fields: (t) => ({
    code: t.exposeString('code'),
    currency: t.exposeString('currency'),
    discountPercent: t.exposeFloat('discountPercent'),
    subtotal: t.exposeFloat('subtotal'),
    eligibleAmount: t.exposeFloat('eligibleAmount'),
    discountAmount: t.exposeFloat('discountAmount'),
    totalAmount: t.exposeFloat('totalAmount'),
    excludedItems: t.exposeInt('excludedItems'),
  }),
});
builder.queryFields((t) => ({
  eventPromoCodes: t.field({
    type: [PromoCodeRef],
    args: { eventId: t.arg.string({ required: true }) },
    resolve: async (_root, args, context) =>
      listPromoCodes(context.prisma, context.auth, args.eventId),
  }),
  entryPromoQuote: t.field({
    type: QuoteRef,
    args: {
      eventId: t.arg.string({ required: true }),
      code: t.arg.string({ required: true }),
      items: t.arg({ type: [QuoteItemRef], required: true }),
    },
    resolve: (_root, args, context) =>
      quoteEntryPromoCode(
        context.prisma,
        args.eventId,
        args.code,
        args.items.map((item) =>
          Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null)),
        ),
      ).catch((error: unknown) => {
        if (error instanceof ValidationError)
          throw new GraphQLError(error.message, { extensions: { code: 'BAD_USER_INPUT' } });
        throw error;
      }),
  }),
}));
builder.mutationFields((t) => ({
  createEventPromoCode: t.field({
    type: ResponseMessageRef,
    args: {
      eventId: t.arg.string({ required: true }),
      code: t.arg.string({ required: true }),
      discountPercent: t.arg.float({ required: true }),
    },
    resolve: (_root, args, context) =>
      createPromoCode(context.prisma, context.auth, args.eventId, args).catch((error: unknown) =>
        rethrowAuthzOrError(error, 'PROMO_CONFIGURATION_INVALID'),
      ),
  }),
  revokeEventPromoCode: t.field({
    type: ResponseMessageRef,
    args: { eventId: t.arg.string({ required: true }), id: t.arg.string({ required: true }) },
    resolve: (_root, args, context) =>
      revokePromoCode(context.prisma, context.auth, args.eventId, args.id).catch((error: unknown) =>
        rethrowAuthzOrError(error, 'PROMO_INVALID'),
      ),
  }),
}));
