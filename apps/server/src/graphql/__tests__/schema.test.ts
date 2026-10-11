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
        'classCompetitorStartTimes',
        'classStartSlotVacancies',
        'competitorById',
        'competitorsByCard',
        'competitorSplits',
        'competitorsByClass',
        'competitorsByOrganisation',
        'competitorsByRegistration',
        'competitorsByTeam',
        'countries',
        'courseLeafletPoints',
        'courseRadioControls',
        'currencies',
        'currentUser',
        'currentUserCards',
        'entryOrderById',
        'entryOrdersByEvent',
        'event',
        'eventClasses',
        'eventClassesByIds',
        'eventEntryAvailability',
        'eventFilesStatus',
        'eventImportStates',
        'eventPaymentMethods',
        'eventRentalCards',
        'eventServiceSettings',
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
        'splitCourseDistances',
        'splitPublicationStatus',
        'teamById',
        'teamsByClass',
      ]),
    );

    expect(sorted(Object.keys(schema.getMutationType()?.getFields() ?? {}))).toEqual(
      sorted([
        '_empty',
        'assignEntryItemRentalCard',
        'changeCurrentUserPassword',
        'classFeeUpdate',
        'classUpdate',
        'competitorCreate',
        'competitorStatusChange',
        'competitorUpdate',
        'createEventRentalCard',
        'createMeosEventBinding',
        'createStartSlotVacancy',
        'createUserCard',
        'deleteCurrentAccount',
        'deleteAllEventRentalCards',
        'deleteCustomEventService',
        'deleteEventRentalCard',
        'deleteMeosEventBinding',
        'deleteStartSlotVacancy',
        'deleteUserCard',
        'entryOrderPaidUpdate',
        'entryOrderProcess',
        'entryOrderStatusUpdate',
        'entryOrderUpdate',
        'loadClassDefinitionsFromExternalSystem',
        'markChangelogProcessed',
        'requestPasswordReset',
        'resendEmailVerification',
        'resetPassword',
        'saveCustomEventService',
        'setDefaultUserCard',
        'signin',
        'updateControlRadioFlag',
        'signup',
        'updateCurrentUser',
        'updateEventRentalCard',
        'updateEventPaymentMethods',
        'updateEventVisibility',
        'updateLateEntryFeePercent',
        'updateStartSlotVacancy',
        'updateSystemEventService',
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
