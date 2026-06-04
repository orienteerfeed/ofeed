import { builder } from '../../graphql/builder.js';
import { StartModeRef } from '../event/event.graphql-types.js';
import {
  listEventEntryAvailability,
  type EntryAvailabilityFee,
  type EntryAvailabilitySlot,
  type EntryAvailabilityClass,
  type EventEntryAvailability,
} from './start-slot-vacancy.service.js';

const EntryAvailabilitySlotRef = builder
  .objectRef<EntryAvailabilitySlot>('EntryAvailabilitySlot')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      startTime: t.expose('startTime', { type: 'DateTime' }),
      bibNumber: t.exposeInt('bibNumber', { nullable: true }),
    }),
  });

const EntryAvailabilityCurrencyRef = builder
  .objectRef<{ code: string; name: string }>('EntryAvailabilityCurrency')
  .implement({
    fields: (t) => ({
      code: t.exposeString('code'),
      name: t.exposeString('name'),
    }),
  });

const EntryAvailabilityFeeRef = builder
  .objectRef<EntryAvailabilityFee>('EntryAvailabilityFee')
  .implement({
    fields: (t) => ({
      amount: t.exposeFloat('amount'),
      net: t.exposeFloat('net'),
      vat: t.exposeFloat('vat'),
    }),
  });

const EntryAvailabilityClassRef = builder
  .objectRef<EntryAvailabilityClass>('EntryAvailabilityClass')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      name: t.exposeString('name'),
      sex: t.exposeString('sex'),
      minAge: t.exposeInt('minAge', { nullable: true }),
      maxAge: t.exposeInt('maxAge', { nullable: true }),
      maxNumberOfCompetitors: t.exposeInt('maxNumberOfCompetitors'),
      competitorCount: t.exposeInt('competitorCount'),
      startMode: t.field({
        type: StartModeRef,
        resolve: (cls) => cls.startMode as never,
      }),
      fee: t.field({
        type: EntryAvailabilityFeeRef,
        nullable: true,
        resolve: (cls) => cls.fee,
      }),
      availableCount: t.exposeInt('availableCount'),
      isFull: t.exposeBoolean('isFull'),
      slots: t.field({
        type: [EntryAvailabilitySlotRef],
        resolve: (cls) => cls.slots,
      }),
    }),
  });

const EntryAvailabilityRef = builder
  .objectRef<EventEntryAvailability>('EntryAvailability')
  .implement({
    fields: (t) => ({
      entriesOpenAt: t.expose('entriesOpenAt', { type: 'DateTime', nullable: true }),
      entriesCloseAt: t.expose('entriesCloseAt', { type: 'DateTime', nullable: true }),
      currency: t.field({
        type: EntryAvailabilityCurrencyRef,
        resolve: (ea) => ea.currency,
      }),
      vatPayer: t.exposeBoolean('vatPayer'),
      vatRate: t.exposeFloat('vatRate', { nullable: true }),
      defaultStartMode: t.field({
        type: StartModeRef,
        resolve: (ea) => ea.defaultStartMode as never,
      }),
      classes: t.field({
        type: [EntryAvailabilityClassRef],
        resolve: (ea) => ea.classes,
      }),
    }),
  });

builder.queryFields((t) => ({
  eventEntryAvailability: t.field({
    type: EntryAvailabilityRef,
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      listEventEntryAvailability(context.prisma, args.eventId),
  }),
}));
