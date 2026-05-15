import type { outputShapeKey } from '@pothos/core';

import { builder } from '../../graphql/builder.js';
import { ResponseMessageRef } from '../graphql/graphql.graphql-types.js';

import {
  changeCompetitorStatusForGraphQL,
  createCompetitorForGraphQL,
  findCompetitorById,
  findCompetitorsByClass,
  findCompetitorsByOrganisation,
  findCompetitorsByTeam,
  findOrganisationNamesByEvent,
  findOrganisationsByEvent,
  searchOrganisationNamesByEvent,
  subscribeCompetitorUpdated,
  subscribeCompetitorsByClassUpdated,
  updateCompetitorForGraphQL,
} from './competitor.service.js';
import { CompetitorRef, OrganisationRef } from './competitor.graphql-types.js';
import {
  competitorsByOrganisationInputSchema,
  organisationNamesInputSchema,
  organisationsInputSchema,
  searchOrganisationNamesInputSchema,
  statusChangeInputSchema,
  storeCompetitorInputSchema,
  updateCompetitorInputSchema,
} from './competitor.schema.js';

type OutputShapeOf<Ref> = Ref extends { [outputShapeKey]: infer Shape } ? Shape : never;
type CompetitorGraphQLShape = OutputShapeOf<typeof CompetitorRef>;

async function requireCompetitor<T>(competitor: Promise<T | null>): Promise<T> {
  const result = await competitor;
  if (!result) {
    throw new Error('Competitor not found');
  }
  return result;
}

const OrganisationNameRef = builder
  .objectRef<{
    id?: number | null;
    name?: string | null;
    countryCode?: string | null;
    country?: string | null;
    competitors: number;
  }>('OrganisationName')
  .implement({
    fields: (t) => ({
      id: t.int({
        resolve: (organisation) => organisation.id as number,
      }),
      name: t.string({
        resolve: (organisation) => organisation.name as string,
      }),
      countryCode: t.string({
        nullable: true,
        resolve: (organisation) => organisation.countryCode ?? null,
      }),
      country: t.string({
        nullable: true,
        resolve: (organisation) => organisation.country ?? null,
      }),
      competitors: t.exposeInt('competitors'),
    }),
  });

const StatusChangeInputRef = builder.inputType('StatusChange', {
  fields: (t) => ({
    eventId: t.id({ required: true }),
    competitorId: t.int({ required: true }),
    origin: t.field({
      type: 'origin_String_NotNull_maxLength_32_pattern_START',
      required: true,
    }),
    status: t.field({
      type: 'status_String_NotNull_maxLength_32_pattern_ActiveInactiveDidNotStartLateStart',
      required: true,
    }),
  }),
});

const UpdateCompetitorInputRef = builder.inputType('UpdateCompetitorInput', {
  fields: (t) => ({
    eventId: t.id({ required: true }),
    competitorId: t.int({ required: true }),
    origin: t.field({
      type: 'origin_String_NotNull_maxLength_32_pattern_STARTFINISHITOFFICE',
      required: true,
    }),
    classId: t.int(),
    firstname: t.string(),
    lastname: t.string(),
    bibNumber: t.int(),
    nationality: t.string(),
    registration: t.string(),
    license: t.string(),
    rankingPoints: t.int(),
    rankingReferenceValue: t.int(),
    organisation: t.string(),
    shortName: t.string(),
    card: t.int(),
    startTime: t.field({ type: 'DateTime' }),
    finishTime: t.field({ type: 'DateTime' }),
    time: t.int(),
    teamId: t.int(),
    leg: t.int(),
    status: t.string(),
    lateStart: t.boolean(),
    note: t.string(),
    externalId: t.string(),
  }),
});

const StoreCompetitorInputRef = builder.inputType('StoreCompetitorInput', {
  fields: (t) => ({
    eventId: t.string({ required: true }),
    classId: t.int({ required: true }),
    origin: t.string({ required: true }),
    firstname: t.string({ required: true }),
    lastname: t.string({ required: true }),
    bibNumber: t.int(),
    nationality: t.string(),
    registration: t.string(),
    license: t.string(),
    rankingPoints: t.int(),
    rankingReferenceValue: t.int(),
    organisation: t.string(),
    shortName: t.string(),
    card: t.int(),
    startTime: t.field({ type: 'DateTime' }),
    finishTime: t.field({ type: 'DateTime' }),
    time: t.int(),
    teamId: t.int(),
    leg: t.int(),
    status: t.string(),
    lateStart: t.boolean(),
    note: t.string(),
    externalId: t.string(),
  }),
});

const StoreCompetitorResponseRef = builder
  .objectRef<{
    message: string;
    competitor: CompetitorGraphQLShape;
  }>('StoreCompetitorResponse')
  .implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      competitor: t.field({
        type: CompetitorRef,
        resolve: (response) => response.competitor,
      }),
    }),
  });

builder.queryFields((t) => ({
  competitorById: t.prismaField({
    type: CompetitorRef,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      requireCompetitor(findCompetitorById(context.prisma, args.id, query)),
  }),
  competitorsByClass: t.prismaField({
    type: [CompetitorRef],
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      findCompetitorsByClass(context.prisma, args.id, query),
  }),
  competitorsByTeam: t.prismaField({
    type: [CompetitorRef],
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) => findCompetitorsByTeam(context.prisma, args.id, query),
  }),
  competitorsByOrganisation: t.prismaField({
    type: [CompetitorRef],
    nullable: true,
    args: {
      eventId: t.arg.string({ required: true }),
      organisation: t.arg.string(),
      organisationId: t.arg.int(),
    },
    resolve: (query, _root, args, context) =>
      findCompetitorsByOrganisation(
        context.prisma,
        competitorsByOrganisationInputSchema.parse({
          eventId: args.eventId as string,
          organisation: args.organisation,
          organisationId: args.organisationId,
        }),
        query,
      ),
  }),
  organisationNames: t.field({
    type: [OrganisationNameRef],
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      findOrganisationNamesByEvent(
        context.prisma,
        organisationNamesInputSchema.parse({ eventId: args.eventId }),
      ),
  }),
  searchOrganisationNames: t.field({
    type: [OrganisationNameRef],
    args: {
      eventId: t.arg.string({ required: true }),
      q: t.arg.string({ required: true }),
    },
    resolve: (_root, args, context) =>
      searchOrganisationNamesByEvent(
        context.prisma,
        searchOrganisationNamesInputSchema.parse({ eventId: args.eventId, q: args.q }),
      ),
  }),
  organisations: t.prismaField({
    type: [OrganisationRef],
    args: {
      eventId: t.arg.string({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      findOrganisationsByEvent(
        context.prisma,
        organisationsInputSchema.parse({ eventId: args.eventId }),
        query,
      ),
  }),
}));

builder.mutationFields((t) => ({
  competitorStatusChange: t.field({
    type: ResponseMessageRef,
    args: {
      input: t.arg({ type: StatusChangeInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      changeCompetitorStatusForGraphQL(
        context.prisma,
        context.auth,
        statusChangeInputSchema.parse(args.input),
      ),
  }),
  competitorUpdate: t.field({
    type: ResponseMessageRef,
    args: {
      input: t.arg({ type: UpdateCompetitorInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      updateCompetitorForGraphQL(
        context.prisma,
        context.auth,
        updateCompetitorInputSchema.parse(args.input),
      ),
  }),
  competitorCreate: t.field({
    type: StoreCompetitorResponseRef,
    args: {
      input: t.arg({ type: StoreCompetitorInputRef, required: true }),
    },
    resolve: (_root, args, context) =>
      createCompetitorForGraphQL(
        context.prisma,
        context.auth,
        storeCompetitorInputSchema.parse(args.input),
      ),
  }),
}));

builder.subscriptionFields((t) => ({
  competitorsByClassUpdated: t.field({
    type: [CompetitorRef],
    nullable: { list: true, items: false },
    args: {
      classId: t.arg.int({ required: true }),
    },
    subscribe: (_root, args, context) =>
      subscribeCompetitorsByClassUpdated(context.prisma, args.classId, context.pubsub),
    resolve: (payload) => payload.competitorsByClassUpdated,
  }),
  competitorUpdated: t.field({
    type: CompetitorRef,
    args: {
      eventId: t.arg.string({ required: true }),
    },
    subscribe: (_root, args, context) =>
      subscribeCompetitorUpdated(args.eventId as string, context.pubsub),
    resolve: (payload) => payload.competitorUpdated as CompetitorGraphQLShape,
  }),
}));
