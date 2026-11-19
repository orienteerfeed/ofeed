import type {
  EntryTimelineDay,
  EventEntryTimeline,
  EntryReportOrder,
  EntryReportItem,
} from '@repo/shared';

import { builder } from '../../graphql/builder.js';

const EntryTimelineDayRef = builder.objectRef<EntryTimelineDay>('EntryTimelineDay').implement({
  fields: (t) => ({
    date: t.exposeString('date'),
    classId: t.exposeInt('classId'),
    className: t.exposeString('className'),
    entries: t.exposeInt('entries'),
    lateEntries: t.exposeInt('lateEntries'),
  }),
});

const EntryReportItemRef = builder.objectRef<EntryReportItem>('EntryReportItem').implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    classId: t.exposeInt('classId'),
    className: t.exposeString('className'),
    firstname: t.exposeString('firstname'),
    lastname: t.exposeString('lastname'),
    organisation: t.exposeString('organisation', { nullable: true }),
    card: t.exposeInt('card', { nullable: true }),
    cardRental: t.exposeBoolean('cardRental'),
    amount: t.exposeFloat('amount'),
  }),
});
const EntryReportOrderRef = builder.objectRef<EntryReportOrder>('EntryReportOrder').implement({
  fields: (t) => ({
    id: t.exposeString('id'),
    receivedAt: t.exposeString('receivedAt'),
    status: t.exposeString('status'),
    paymentReference: t.exposeString('paymentReference'),
    paymentMethod: t.exposeString('paymentMethod', { nullable: true }),
    currency: t.exposeString('currency'),
    totalAmount: t.exposeFloat('totalAmount'),
    receivedAmount: t.exposeFloat('receivedAmount'),
    outstandingAmount: t.exposeFloat('outstandingAmount'),
    legacyPaid: t.exposeBoolean('legacyPaid'),
    paid: t.exposeBoolean('paid'),
    promoCode: t.exposeString('promoCode', { nullable: true }),
    promoDiscountAmount: t.exposeFloat('promoDiscountAmount'),
    items: t.field({ type: [EntryReportItemRef], resolve: (order) => order.items }),
  }),
});

export const EventEntryTimelineRef = builder
  .objectRef<EventEntryTimeline>('EventEntryTimeline')
  .implement({
    fields: (t) => ({
      eventName: t.string({ nullable: true, resolve: (value) => value.eventName ?? null }),
      location: t.string({ nullable: true, resolve: (value) => value.location ?? null }),
      startAt: t.string({ nullable: true, resolve: (value) => value.startAt ?? null }),
      orders: t.field({
        type: [EntryReportOrderRef],
        nullable: true,
        resolve: (value) => value.orders ?? null,
      }),
      timezone: t.exposeString('timezone'),
      entriesOpenOn: t.exposeString('entriesOpenOn', { nullable: true }),
      entriesCloseOn: t.exposeString('entriesCloseOn', { nullable: true }),
      eventOn: t.exposeString('eventOn'),
      days: t.field({
        type: [EntryTimelineDayRef],
        resolve: (timeline) => timeline.days,
      }),
    }),
  });
