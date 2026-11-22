import { builder } from '../../graphql/builder.js';
import { CompetitorRef } from '../competitor/competitor.graphql-types.js';
import { athleteFollowSourceSchema, type AthleteFollow } from '@repo/shared';
import { listAthleteFollows, mutateAthleteFollow } from './athlete-follows.service.js';
import {
  favoriteCompetitorIds,
  selectedEventCompetitors,
  setCompetitorFavorite,
} from './favorites.service.js';

const FollowSourceRef = builder.enumType('AthleteFollowSource', {
  values: athleteFollowSourceSchema.options,
});
const FollowRef = builder.objectRef<AthleteFollow>('AthleteFollow').implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    registration: t.exposeString('registration'),
    source: t.expose('source', { type: FollowSourceRef }),
    displayName: t.exposeString('displayName'),
    pausedAt: t.exposeString('pausedAt', { nullable: true }),
    createdAt: t.exposeString('createdAt'),
  }),
});
builder.queryField('myAthleteFollows', (t) =>
  t.field({ type: [FollowRef], resolve: (_, __, ctx) => listAthleteFollows(ctx.prisma, ctx.auth) }),
);
builder.mutationFields((t) => ({
  setAthleteFollowPaused: t.boolean({
    args: { id: t.arg.id({ required: true }), paused: t.arg.boolean({ required: true }) },
    resolve: (_, args, ctx) =>
      mutateAthleteFollow(ctx.prisma, ctx.auth, { ...args, id: String(args.id) }),
  }),
  removeAthleteFollow: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: (_, args, ctx) =>
      mutateAthleteFollow(ctx.prisma, ctx.auth, { id: String(args.id) }, true),
  }),
}));

builder.queryFields((t) => ({
  myEventFavoriteCompetitorIds: t.intList({
    args: { eventId: t.arg.string({ required: true }) },
    resolve: (_, args, ctx) => favoriteCompetitorIds(ctx.prisma, ctx.auth, args),
  }),
  eventFavoriteCompetitors: t.prismaField({
    type: [CompetitorRef],
    args: {
      eventId: t.arg.string({ required: true }),
      competitorIds: t.arg.intList({ required: true }),
    },
    resolve: (query, _, args, ctx) => selectedEventCompetitors(ctx.prisma, ctx.auth, args, query),
  }),
}));
builder.mutationField('setCompetitorFavorite', (t) =>
  t.boolean({
    args: {
      eventId: t.arg.string({ required: true }),
      competitorId: t.arg.int({ required: true }),
      favorite: t.arg.boolean({ required: true }),
    },
    resolve: (_, args, ctx) => setCompetitorFavorite(ctx.prisma, ctx.auth, args),
  }),
);
