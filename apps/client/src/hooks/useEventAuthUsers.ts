import { gql } from '@apollo/client';
import { useQuery } from '@apollo/client/react';

// 1. Definice typů
interface EventAuth {
  authorId: number;
}

interface GetEventAuthUsersData {
  event: EventAuth;
}

interface GetEventAuthUsersVariables {
  eventId: string;
}

const GET_EVENT_AUTH_USERS = gql`
  query GetEventAuthUsers($eventId: String!) {
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
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
    skip: !eventId,
  });

  return {
    event: data?.event,
    loading,
    error: error ? new Error(error.message) : undefined,
  };
};
