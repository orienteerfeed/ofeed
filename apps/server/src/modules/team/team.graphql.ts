import { builder } from '../../graphql/builder.js';
import { organisationSelect } from '../event/organisation.helpers.js';

import { findTeamById, findTeamsByClass } from './team.service.js';

async function requireTeam<T>(team: Promise<T | null>): Promise<T> {
  const result = await team;
  if (!result) {
    throw new Error('Team not found');
  }
  return result;
}

type FlatOrganisationShape = {
  organisation?: string | { name?: string | null; shortName?: string | null } | null;
  shortName?: string | null;
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

export const TeamRef = builder.prismaObject('Team', {
  fields: (t) => ({
    id: t.exposeInt('id'),
    class: t.relation('class'),
    classId: t.exposeInt('classId'),
    name: t.exposeString('name'),
    organisation: t.string({
      nullable: true,
      select: { organisation: { select: organisationSelect } },
      resolve: (team) => resolveOrganisationName(team as FlatOrganisationShape),
    }),
    shortName: t.string({
      nullable: true,
      select: { organisation: { select: organisationSelect } },
      resolve: (team) => resolveOrganisationShortName(team as FlatOrganisationShape),
    }),
    bibNumber: t.exposeInt('bibNumber', { nullable: true }),
    externalId: t.exposeString('externalId', { nullable: true }),
    competitors: t.relation('competitors', { nullable: true }),
  }),
});

builder.queryFields((t) => ({
  teamById: t.prismaField({
    type: TeamRef,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) =>
      requireTeam(findTeamById(context.prisma, args.id, query)),
  }),
  teamsByClass: t.prismaField({
    type: [TeamRef],
    nullable: true,
    args: {
      id: t.arg.int({ required: true }),
    },
    resolve: (query, _root, args, context) => findTeamsByClass(context.prisma, args.id, query),
  }),
}));
