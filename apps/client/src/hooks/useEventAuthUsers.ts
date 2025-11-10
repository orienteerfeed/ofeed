import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

// 1. Definice typů
interface EventAuth {
  authorId: string;
}

interface GetEventAuthUsersData {
  event: EventAuth;
}

interface GetEventAuthUsersVariables {
  eventId: string;
}

const GET_EVENT_AUTH_USERS = gql`
  query Event($eventId: String!) {
    event(id: $eventId) {
      authorId
    }
  }
`;

export const useEventAuthUsers = (eventId: string) => {
  const { data, loading, error } = useQuery<
    GetEventAuthUsersData,
    GetEventAuthUsersVariables
  >(GET_EVENT_AUTH_USERS, {
    variables: { eventId },
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    skip: !eventId,
  });

  return {
    event: data?.event,
    loading,
    error: error ? new Error(error.message) : undefined,
  };
};
