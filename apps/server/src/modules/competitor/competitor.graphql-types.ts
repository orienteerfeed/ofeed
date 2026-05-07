import { builder } from '../../graphql/builder.js';
import { organisationSelect } from '../event/organisation.helpers.js';
import { SplitRef } from '../split/split.graphql-types.js';

import { findCompetitorSplits } from './competitor.service.js';

type FlatOrganisationShape = {
  organisation?: string | { name?: string | null; shortName?: string | null } | null;
  shortName?: string | null;
};

type RankingMetaShape = {
  countsTowardsRanking?: boolean | null;
  countsTowardsRankingReason?: string | null;
};

function resolveOrganisationName(parent: FlatOrganisationShape) {
  if (typeof parent.organisation === 'string') {
    return parent.organisation;
  }

  if (parent.organisation && typeof parent.organisation === 'object') {
    return parent.organisation.name ?? null;
  }

  return null;
}

function resolveOrganisationShortName(parent: FlatOrganisationShape) {
  if (typeof parent.shortName === 'string') {
    return parent.shortName;
  }

  if (parent.organisation && typeof parent.organisation === 'object') {
    return parent.organisation.shortName ?? null;
  }

  return null;
}

export const OrganisationRef = builder.prismaObject('Organisation', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    eventId: t.exposeString('eventId'),
    externalId: t.exposeString('externalId', { nullable: true }),
    name: t.exposeString('name'),
    nationality: t.exposeString('nationality', { nullable: true }),
    shortName: t.exposeString('shortName', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime', nullable: true }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime', nullable: true }),
  }),
});

export const CompetitorRef = builder.prismaObject('Competitor', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    class: t.relation('class'),
    classId: t.exposeInt('classId'),
    team: t.relation('team', { nullable: true }),
    teamId: t.exposeInt('teamId', { nullable: true }),
    leg: t.exposeInt('leg', { nullable: true }),
    firstname: t.exposeString('firstname'),
    lastname: t.exposeString('lastname'),
    bibNumber: t.exposeInt('bibNumber', { nullable: true }),
    nationality: t.exposeString('nationality', { nullable: true }),
    registration: t.exposeString('registration'),
    license: t.exposeString('license', { nullable: true }),
    rankingPoints: t.exposeInt('rankingPoints', { nullable: true }),
    rankingReferenceValue: t.exposeInt('rankingReferenceValue', { nullable: true }),
    countsTowardsRanking: t.boolean({
      nullable: true,
      resolve: (competitor) =>
        (competitor as typeof competitor & RankingMetaShape).countsTowardsRanking ?? null,
    }),
    countsTowardsRankingReason: t.string({
      nullable: true,
      resolve: (competitor) =>
        (competitor as typeof competitor & RankingMetaShape).countsTowardsRankingReason ?? null,
    }),
    organisationId: t.exposeInt('organisationId', { nullable: true }),
    organisation: t.string({
      nullable: true,
      select: { organisation: { select: organisationSelect } },
      resolve: (competitor) => resolveOrganisationName(competitor as FlatOrganisationShape),
    }),
    shortName: t.string({
      nullable: true,
      select: { organisation: { select: organisationSelect } },
      resolve: (competitor) => resolveOrganisationShortName(competitor as FlatOrganisationShape),
    }),
    card: t.exposeInt('card', { nullable: true }),
    startTime: t.expose('startTime', { type: 'DateTime', nullable: true }),
    finishTime: t.expose('finishTime', { type: 'DateTime', nullable: true }),
    time: t.exposeInt('time', { nullable: true }),
    status: t.string({
      nullable: true,
      resolve: (competitor) => competitor.status,
    }),
    lateStart: t.exposeBoolean('lateStart'),
    note: t.exposeString('note', { nullable: true }),
    externalId: t.exposeString('externalId', { nullable: true }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    splits: t.field({
      type: [SplitRef],
      nullable: true,
      select: {
        id: true,
        classId: true,
      },
      resolve: (competitor, _args, context) =>
        findCompetitorSplits(context.prisma, context.auth, competitor),
    }),
  }),
});
