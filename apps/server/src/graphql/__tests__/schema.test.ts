import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { schema } from '../schema.js';

const require = createRequire(import.meta.url);
const pothosRequire = createRequire(require.resolve('@pothos/core'));
const { lexicographicSortSchema, printSchema } = pothosRequire(
  'graphql',
) as typeof import('graphql');

describe('Pothos GraphQL schema', () => {
  it('builds the public root operation fields', () => {
    const sorted = (fields: string[]) => fields.sort((left, right) => left.localeCompare(right));

    expect(sorted(Object.keys(schema.getQueryType()?.getFields() ?? {}))).toEqual(
      sorted([
        '_empty',
        'activeSystemMessages',
        'changelogByEvent',
        'classById',
        'competitorById',
        'competitorSplits',
        'competitorsByClass',
        'competitorsByOrganisation',
        'competitorsByTeam',
        'countries',
        'currentUser',
        'currentUserCards',
        'event',
        'eventClasses',
        'eventClassesByIds',
        'eventEntryAvailability',
        'events',
        'eventsBySport',
        'eventsByUser',
        'myEvents',
        'organisationNames',
        'organisations',
        'searchEvents',
        'searchOrganisationNames',
        'sport',
        'sports',
        'splitPublicationStatus',
        'teamById',
        'teamsByClass',
      ]),
    );

    expect(sorted(Object.keys(schema.getMutationType()?.getFields() ?? {}))).toEqual(
      sorted([
        '_empty',
        'changeCurrentUserPassword',
        'classFeeUpdate',
        'competitorCreate',
        'competitorStatusChange',
        'competitorUpdate',
        'createMeosEventBinding',
        'createUserCard',
        'deleteMeosEventBinding',
        'deleteUserCard',
        'markChangelogProcessed',
        'requestPasswordReset',
        'resendEmailVerification',
        'resetPassword',
        'setDefaultUserCard',
        'signin',
        'signup',
        'updateCurrentUser',
        'updateEventVisibility',
        'updateUserCard',
        'verifyEmail',
      ]),
    );

    expect(sorted(Object.keys(schema.getSubscriptionType()?.getFields() ?? {}))).toEqual(
      sorted([
        '_empty',
        'competitorUpdated',
        'competitorsByClassUpdated',
        'splitCompetitorsByClassUpdated',
        'winnerUpdated',
      ]),
    );
  });

  it('matches the public schema snapshot', () => {
    expect(printSchema(lexicographicSortSchema(schema))).toMatchSnapshot();
  });
});
