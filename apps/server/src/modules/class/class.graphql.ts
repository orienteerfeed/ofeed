import { builder } from '../../graphql/builder.js';

import { rethrowAuthzOrError } from '../../graphql/errors.js';
import { StartModeRef } from '../event/event.graphql-types.js';
import { ResponseMessageRef } from '../graphql/graphql.graphql-types.js';
import { computeClassFee, type ComputedClassFee } from './class.fee.js';
import {
  findClassById,
  findEventClasses,
  findEventClassesByIds,
  updateClassFeeForGraphQL,
} from './class.service.js';

/**
 * Columns needed to derive a class's effective fee: the class base fee plus the
 * event-level currency/VAT/late-entry configuration. Shared by the computed fee
 * fields so Pothos selects them once.
 */
const FEE_SELECT = {
  fee: true,
  event: {
    select: {
      entriesCloseAt: true,
      vatPayer: true,
      vatRate: true,
      lateEntryFeePercent: true,
    },
  },
} as const;

type ClassWithFeeConfig = {
  fee: { toNumber(): number } | null;
  event: {
    entriesCloseAt: Date | null;
    vatPayer: boolean;
    vatRate: { toNumber(): number } | null;
    lateEntryFeePercent: { toNumber(): number } | null;
  };
};

function resolveComputedFee(eventClass: ClassWithFeeConfig): ComputedClassFee {
  const { event } = eventClass;
  return computeClassFee({
    baseFee: eventClass.fee?.toNumber() ?? null,
    now: new Date(),
    entriesCloseAt: event.entriesCloseAt,
    lateEntryFeePercent: event.lateEntryFeePercent?.toNumber() ?? null,
    vatPayer: event.vatPayer,
    vatRate: event.vatRate?.toNumber() ?? null,
  });
}

async function requireClass<T>(eventClass: Promise<T | null>): Promise<T> {
  const result = await eventClass;
  if (!result) {
    throw new Error('Class not found');
  }
  return result;
}

export const ClassRef = builder.prismaObject('Class', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    eventId: t.exposeString('eventId'),
    externalId: t.exposeString('externalId', { nullable: true }),
    name: t.exposeString('name'),
    startName: t.exposeString('startName', { nullable: true }),
    length: t.exposeInt('length', { nullable: true }),
    climb: t.exposeInt('climb', { nullable: true }),
    controlsCount: t.exposeInt('controlsCount', { nullable: true }),
    competitorsCount: t.exposeInt('competitorsCount', { nullable: true }),
    maxNumberOfCompetitors: t.exposeInt('maxNumberOfCompetitors', { nullable: true }),
    resultListMode: t.exposeString('resultListMode', { nullable: true }),
    startMode: t.field({
      type: StartModeRef,
      nullable: true,
      resolve: (eventClass) => eventClass.startMode,
    }),
    startWindowFrom: t.expose('startWindowFrom', { type: 'DateTime', nullable: true }),
    startWindowTo: t.expose('startWindowTo', { type: 'DateTime', nullable: true }),
    fee: t.float({
      nullable: true,
      select: { fee: true },
      resolve: (eventClass) => eventClass.fee?.toNumber() ?? null,
    }),
    currentFee: t.float({
      nullable: true,
      select: FEE_SELECT,
      resolve: (eventClass) => resolveComputedFee(eventClass).currentFee,
    }),
    feeNet: t.float({
      nullable: true,
      select: FEE_SELECT,
      resolve: (eventClass) => resolveComputedFee(eventClass).feeNet,
    }),
    feeVat: t.float({
      nullable: true,
      select: FEE_SELECT,
      resolve: (eventClass) => resolveComputedFee(eventClass).feeVat,
    }),
    minAge: t.exposeInt('minAge', { nullable: true }),
    maxAge: t.exposeInt('maxAge', { nullable: true }),
    sex: t.string({
      nullable: true,
      resolve: (eventClass) => eventClass.sex,
    }),
    status: t.string({
      nullable: true,
      resolve: (eventClass) => eventClass.status,
    }),
    competitors: t.relation('competitors', { nullable: true }),
    teams: t.relation('teams', { nullable: true }),
  }),
});

builder.queryFields((t) => ({
  classById: t.prismaField({
    type: ClassRef,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      requireClass(findClassById(context.prisma, args.id, query)),
  }),
  eventClasses: t.prismaField({
    type: [ClassRef],
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, context) => findEventClasses(context.prisma, args.eventId, query),
  }),
  eventClassesByIds: t.prismaField({
    type: [ClassRef],
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
      ids: t.arg.intList(),
    },
    resolve: (query, _root, args, context) =>
      findEventClassesByIds(context.prisma, args.eventId, args.ids, query),
  }),
}));

const UpdateClassFeeInputRef = builder.inputType('UpdateClassFeeInput', {
  fields: (t) => ({
    classId: t.int({ required: true }),
    /** Gross entry fee (incl. VAT); null clears the fee. */
    fee: t.float({ required: false }),
  }),
});

builder.mutationFields((t) => ({
  classFeeUpdate: t.field({
    type: ResponseMessageRef,
    args: {
      input: t.arg({ type: UpdateClassFeeInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateClassFeeForGraphQL(context.prisma, context.auth, {
        classId: args.input.classId,
        fee: args.input.fee ?? null,
      }).catch((err: unknown) => rethrowAuthzOrError(err, 'Failed to update class fee')),
  }),
}));
