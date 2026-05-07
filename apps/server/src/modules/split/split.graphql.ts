import { builder } from '../../graphql/builder.js';
import { CompetitorRef } from '../competitor/competitor.graphql-types.js';
import { SplitPublicationModeRef } from '../event/event.graphql-types.js';

import { SplitRef } from './split.graphql-types.js';
import {
  findSplitPublicationStatus,
  findSplitsByCompetitor,
  subscribeSplitCompetitorsByClassUpdated,
} from './split.service.js';
import { competitorSplitsInputSchema, splitPublicationStatusInputSchema } from './split.schema.js';

const SplitPublicationReasonRef = builder.enumType('SplitPublicationReason', {
  values: ['PUBLISHED', 'WAITING_FOR_LAST_START', 'WAITING_FOR_SCHEDULED', 'DISABLED'] as const,
});

const SplitPublicationStatusRef = builder
  .objectRef<{
    eventId: string;
    classId: number;
    mode: 'UNRESTRICTED' | 'LAST_START' | 'SCHEDULED' | 'DISABLED';
    isPublished: boolean;
    isAccessible: boolean;
    publishAt: Date | null;
    reason: 'PUBLISHED' | 'WAITING_FOR_LAST_START' | 'WAITING_FOR_SCHEDULED' | 'DISABLED';
  }>('SplitPublicationStatus')
  .implement({
    fields: (t) => ({
      eventId: t.exposeString('eventId'),
      classId: t.exposeInt('classId'),
      mode: t.field({
        type: SplitPublicationModeRef,
        resolve: (status) => status.mode,
      }),
      isPublished: t.exposeBoolean('isPublished'),
      isAccessible: t.exposeBoolean('isAccessible'),
      publishAt: t.expose('publishAt', { type: 'DateTime', nullable: true }),
      reason: t.field({
        type: SplitPublicationReasonRef,
        resolve: (status) => status.reason,
      }),
    }),
  });

builder.queryFields((t) => ({
  competitorSplits: t.field({
    type: [SplitRef],
    nullable: { list: true, items: false },
    args: {
      competitorId: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      findSplitsByCompetitor(
        context.prisma,
        context.auth,
        competitorSplitsInputSchema.parse({ competitorId: args.competitorId }),
      ),
  }),
  splitPublicationStatus: t.field({
    type: SplitPublicationStatusRef,
    args: {
      classId: t.arg.int({ required: true }),
    },
    resolve: (_root, args, context) =>
      findSplitPublicationStatus(
        context.prisma,
        context.auth,
        splitPublicationStatusInputSchema.parse({ classId: args.classId }),
      ),
  }),
}));

builder.subscriptionFields((t) => ({
  splitCompetitorsByClassUpdated: t.field({
    type: [CompetitorRef],
    nullable: { list: true, items: false },
    args: {
      classId: t.arg.int({ required: true }),
    },
    subscribe: (_root, args, context) =>
      subscribeSplitCompetitorsByClassUpdated(
        context.prisma,
        context.auth,
        args.classId,
        context.pubsub,
      ),
    resolve: (payload) => payload.splitCompetitorsByClassUpdated,
  }),
}));
