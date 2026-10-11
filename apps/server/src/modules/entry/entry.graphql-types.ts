import {
  createQrPaymentInstruction,
  type EntryItemPreviousValue,
  type QrPaymentInstruction,
} from '@repo/shared';

import { EntryItemActionKey, EntryStatus } from '../../generated/prisma/enums.js';
import { builder } from '../../graphql/builder.js';
import { PaymentMethodTypeRef } from '../event/event-payment-methods.graphql-types.js';

/**
 * Entry order lifecycle: RECEIVED -> APPROVED -> PROCESSED.
 * Payment is tracked separately on Entry.paid. From RECEIVED or APPROVED the order can instead be rejected
 * (organizer/admin) or cancelled (primarily the entry's own creator, or an
 * organizer/admin on their behalf). PROCESSED, REJECTED, and CANCELLED are
 * all terminal — reached only through `entryOrderProcess` /
 * `entryOrderStatusUpdate` respectively, and immutable afterward.
 */
export const EntryStatusRef = builder.enumType(EntryStatus, {
  name: 'EntryStatus',
});

/**
 * What an entry item represents: a brand-new registration, or a requested
 * change against an already-submitted one (see `EntryItem.previousValue`).
 */
export const EntryItemActionKeyRef = builder.enumType(EntryItemActionKey, {
  name: 'EntryItemActionKey',
});

/**
 * Snapshot of the field(s) an item's `actionKey` replaced. Only the field(s)
 * relevant to that action are set (e.g. only `card` for `CARD_CHANGE`).
 */
export const EntryItemPreviousValueRef = builder
  .objectRef<EntryItemPreviousValue>('EntryItemPreviousValue')
  .implement({
    fields: (t) => ({
      card: t.int({ nullable: true, resolve: (value) => value.card ?? null }),
      startTime: t.field({
        type: 'DateTime',
        nullable: true,
        resolve: (value) => (value.startTime ? new Date(value.startTime) : null),
      }),
      firstname: t.string({ nullable: true, resolve: (value) => value.firstname ?? null }),
      lastname: t.string({ nullable: true, resolve: (value) => value.lastname ?? null }),
      className: t.string({ nullable: true, resolve: (value) => value.className ?? null }),
    }),
  });

export const EntryItemRef = builder.prismaObject('EntryItem', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    classId: t.exposeInt('classId'),
    firstname: t.exposeString('firstname'),
    lastname: t.exposeString('lastname'),
    registration: t.exposeString('registration', { nullable: true }),
    birthYear: t.exposeInt('birthYear', { nullable: true }),
    organisation: t.exposeString('organisation', { nullable: true }),
    license: t.exposeString('license', { nullable: true }),
    note: t.exposeString('note', { nullable: true }),
    card: t.exposeInt('card', { nullable: true }),
    cardRental: t.exposeBoolean('cardRental'),
    startTime: t.expose('startTime', { type: 'DateTime', nullable: true }),
    fee: t.float({
      select: { fee: true },
      resolve: (item) => item.fee.toNumber(),
    }),
    cardRentalFee: t.float({
      nullable: true,
      select: { cardRentalFee: true },
      resolve: (item) => item.cardRentalFee?.toNumber() ?? null,
    }),
    competitorId: t.exposeInt('competitorId', { nullable: true }),
    actionKey: t.field({
      type: EntryItemActionKeyRef,
      resolve: (item) => item.actionKey,
    }),
    previousValue: t.field({
      type: EntryItemPreviousValueRef,
      nullable: true,
      select: { previousValue: true },
      resolve: (item) => item.previousValue as EntryItemPreviousValue | null,
    }),
    class: t.relation('class'),
    competitor: t.relation('competitor', { nullable: true }),
  }),
});

/**
 * A purchased add-on service (accommodation/food/parking/...) attached to an
 * order. No public flow creates these yet — see `EntryAddOnItem` in
 * schema.prisma.
 */
export const EntryAddOnItemRef = builder.prismaObject('EntryAddOnItem', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    quantity: t.exposeInt('quantity'),
    price: t.float({
      select: { price: true },
      resolve: (item) => item.price.toNumber(),
    }),
    serviceName: t.string({
      select: { service: { select: { name: true } } },
      resolve: (item) => item.service.name,
    }),
    serviceDescription: t.string({
      nullable: true,
      select: { service: { select: { description: true } } },
      resolve: (item) => item.service.description,
    }),
  }),
});

/** One entry in an order's status timeline (see `EntryStatusHistory` in schema.prisma). */
export const EntryStatusHistoryRef = builder.prismaObject('EntryStatusHistory', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    status: t.field({
      type: EntryStatusRef,
      nullable: true,
      resolve: (history) => history.status,
    }),
    paymentState: t.exposeBoolean('paymentState', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    changedByName: t.string({
      nullable: true,
      select: { changedBy: { select: { firstname: true, lastname: true } } },
      resolve: (history) =>
        history.changedBy ? `${history.changedBy.firstname} ${history.changedBy.lastname}` : null,
    }),
  }),
});

const QrPaymentInstructionRef = builder
  .objectRef<QrPaymentInstruction>('QrPaymentInstruction')
  .implement({
    fields: (t) => ({
      payload: t.exposeString('payload'),
      bankAccountIban: t.exposeString('bankAccountIban'),
      bankAccountName: t.exposeString('bankAccountName', { nullable: true }),
      amount: t.exposeFloat('amount'),
      currency: t.exposeString('currency'),
      paymentReference: t.exposeString('paymentReference'),
      constantSymbol: t.exposeString('constantSymbol'),
      recipientMessage: t.exposeString('recipientMessage'),
    }),
  });

/**
 * An entry order (a submitted registration batch). Contact/personal fields
 * here are only reachable through owner/admin-gated queries — never expose
 * this type from an unauthenticated resolver.
 */
export const EntryRef = builder.prismaObject('Entry', {
  fields: (t) => ({
    id: t.exposeString('id'),
    eventId: t.exposeString('eventId'),
    status: t.field({
      type: EntryStatusRef,
      resolve: (entry) => entry.status,
    }),
    paid: t.exposeBoolean('paid'),
    paymentMethod: t.field({
      type: PaymentMethodTypeRef,
      nullable: true,
      resolve: (entry) => entry.paymentMethod,
    }),
    paymentReference: t.exposeString('paymentReference'),
    qrPayment: t.field({
      type: QrPaymentInstructionRef,
      nullable: true,
      select: {
        paymentMethod: true,
        totalAmount: true,
        currency: true,
        paymentReference: true,
        contactFirstname: true,
        contactLastname: true,
        event: {
          select: {
            bankAccountIban: true,
            bankAccountName: true,
          },
        },
      },
      resolve: (entry) => {
        if (entry.paymentMethod !== 'QR_PAYMENT' || !entry.event.bankAccountIban) return null;

        return createQrPaymentInstruction({
          bankAccountIban: entry.event.bankAccountIban,
          bankAccountName: entry.event.bankAccountName,
          amount: entry.totalAmount.toNumber(),
          currency: entry.currency,
          paymentReference: entry.paymentReference,
          message: `OFeed QR payment - ${entry.contactLastname} ${entry.contactFirstname}`,
        });
      },
    }),
    userId: t.exposeInt('userId', { nullable: true }),
    contactEmail: t.exposeString('contactEmail'),
    contactFirstname: t.exposeString('contactFirstname'),
    contactLastname: t.exposeString('contactLastname'),
    totalAmount: t.float({
      select: { totalAmount: true },
      resolve: (entry) => entry.totalAmount.toNumber(),
    }),
    currency: t.exposeString('currency'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    items: t.relation('items'),
    addOnItems: t.relation('addOnItems'),
    statusHistory: t.relation('statusHistory', {
      query: { orderBy: { createdAt: 'asc' } },
    }),
    event: t.relation('event'),
  }),
});
