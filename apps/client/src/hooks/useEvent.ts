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
      zeroTime
      externalSource
      externalEventId
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
