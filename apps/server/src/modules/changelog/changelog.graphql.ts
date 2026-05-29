import type { outputShapeKey } from '@pothos/core';

import { builder } from '../../graphql/builder.js';
import { CompetitorRef } from '../competitor/competitor.graphql-types.js';
import { EventRef } from '../event/event.graphql-types.js';
import { UserRef } from '../user/user.graphql-types.js';

import { rethrowAuthzOrError } from '../../graphql/errors.js';
import {
  changelogByEventInputSchema,
  markChangelogProcessedInputSchema,
} from './changelog.schema.js';
import { findChangelogByEvent, markChangelogProcessed } from './changelog.service.js';

type OutputShapeOf<Ref> = Ref extends { [outputShapeKey]: infer Shape } ? Shape : never;
type CompetitorGraphQLShape = OutputShapeOf<typeof CompetitorRef>;
type EventGraphQLShape = OutputShapeOf<typeof EventRef>;
type UserGraphQLShape = OutputShapeOf<typeof UserRef>;

type ChangelogShape = {
  id: number;
  eventId: string;
  competitorId: number;
  origin: string;
  type: string;
  previousValue?: string | null;
  newValue?: string | null;
  authorId: number;
  createdAt: Date;
  processed: boolean;
  processedAt?: Date | null;
  processedByType?: string | null;
  processedBySource?: string | null;
  competitor: unknown;
  event: unknown;
  author: unknown;
  processedByUser?: unknown | null;
};

type ChangelogProcessingShape = {
  id: number;
  processed: boolean;
  processedAt?: Date | null;
  processedByType?: string | null;
  processedBySource?: string | null;
};

const ProtocolProcessedByTypeRef = builder.enumType('ProtocolProcessedByType', {
  values: ['INTEGRATION', 'SYSTEM'] as const,
});

const ChangelogRef = builder.objectRef<ChangelogShape>('Changelog').implement({
  fields: (t) => ({
    id: t.exposeInt('id'),
    eventId: t.exposeString('eventId'),
    competitorId: t.exposeInt('competitorId'),
    origin: t.exposeString('origin'),
    type: t.exposeString('type'),
    previousValue: t.exposeString('previousValue', { nullable: true }),
    newValue: t.exposeString('newValue', { nullable: true }),
    authorId: t.exposeInt('authorId'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    processed: t.exposeBoolean('processed'),
    processedAt: t.expose('processedAt', { type: 'DateTime', nullable: true }),
    processedByType: t.exposeString('processedByType', { nullable: true }),
    processedBySource: t.exposeString('processedBySource', { nullable: true }),
    competitor: t.field({
      type: CompetitorRef,
      resolve: (changelog) => changelog.competitor as CompetitorGraphQLShape,
    }),
    event: t.field({
      type: EventRef,
      resolve: (changelog) => changelog.event as EventGraphQLShape,
    }),
    author: t.field({
      type: UserRef,
      resolve: (changelog) => changelog.author as UserGraphQLShape,
    }),
    processedByUser: t.field({
      type: UserRef,
      nullable: true,
      resolve: (changelog) => changelog.processedByUser as UserGraphQLShape | null,
    }),
  }),
});

const ChangelogProcessingRef = builder
  .objectRef<ChangelogProcessingShape>('ChangelogProcessing')
  .implement({
    fields: (t) => ({
      id: t.exposeInt('id'),
      processed: t.exposeBoolean('processed'),
      processedAt: t.expose('processedAt', { type: 'DateTime', nullable: true }),
      processedByType: t.exposeString('processedByType', { nullable: true }),
      processedBySource: t.exposeString('processedBySource', { nullable: true }),
    }),
  });

builder.queryFields((t) => ({
  changelogByEvent: t.field({
    type: [ChangelogRef],
    nullable: { list: true, items: false },
    args: {
      eventId: t.arg.string({ required: true }),
      origin: t.arg.string(),
      classId: t.arg.int(),
      since: t.arg({ type: 'DateTime' }),
    },
    resolve: async (_root, args, context) => {
      try {
        return (await findChangelogByEvent(
          context.prisma,
          context.auth,
          changelogByEventInputSchema.parse({
            eventId: args.eventId,
            origin: args.origin,
            classId: args.classId,
            since: args.since,
          }),
        )) as ChangelogShape[];
      } catch (err) {
        rethrowAuthzOrError(err, 'Failed to fetch changelog');
      }
    },
  }),
}));

builder.mutationFields((t) => ({
  markChangelogProcessed: t.field({
    type: ChangelogProcessingRef,
    args: {
      eventId: t.arg.string({ required: true }),
      protocolId: t.arg.int({ required: true }),
      processedByType: t.arg({ type: ProtocolProcessedByTypeRef, required: false }),
      processedBySource: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, context) => {
      try {
        return markChangelogProcessed(
          context.prisma,
          context.auth,
          markChangelogProcessedInputSchema.parse({
            eventId: args.eventId,
            protocolId: args.protocolId,
            processedByType: args.processedByType ?? 'INTEGRATION',
            processedBySource: args.processedBySource,
          }),
        );
      } catch (err) {
        rethrowAuthzOrError(err, 'Failed to mark changelog entry as processed');
      }
    },
  }),
}));
