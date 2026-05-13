import type { outputShapeKey } from '@pothos/core';

import { builder } from '../../graphql/builder.js';
import { CompetitorRef } from '../competitor/competitor.graphql-types.js';
import { EventRef } from '../event/event.graphql-types.js';
import { UserRef } from '../user/user.graphql-types.js';

import { changelogByEventInputSchema } from './changelog.schema.js';
import { findChangelogByEvent } from './changelog.service.js';

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
  competitor: unknown;
  event: unknown;
  author: unknown;
};

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
        const message =
          err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
            ? err.message
            : 'Failed to fetch changelog';
        throw new Error(message);
      }
    },
  }),
}));
