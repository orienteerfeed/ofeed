import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';
import { Event, EventQueryData, EventQueryVariables } from '../types/event';

const GET_EVENT = gql`
  query Event($eventId: String!) {
    event(id: $eventId) {
      id
      name
      organizer
      location
      country {
        countryCode
        countryName
      }
      sport {
        id
        name
      }
      date
      timezone
      discipline
      externalSource
      externalEventId
      entriesOpenAt
      entriesCloseAt
      resultsOfficialAt
      resultsOfficialManuallySetAt
      ranking
      coefRanking
      startMode
      relay
      published
      authorId
      classes {
        id
        name
        length
        climb
      }
      user {
        id
        firstname
        lastname
      }
      statusSummary {
        primary
        lifecycle
        results
        entries
        entriesConfigured
        officialResultsUrl
        officialResultsSource
        resultsOfficialAt
        resultsOfficialCheckedAt
      }
    }
  }
`;

export const useEvent = (eventId: string) => {
  const { data, loading, error } = useQuery<
    EventQueryData,
    EventQueryVariables
  >(GET_EVENT, {
    variables: { eventId },
    skip: !eventId,
  });

  return {
    event: data?.event as Event | undefined,
    loading,
    error,
  };
};
