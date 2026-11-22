import { gql } from '@apollo/client';
import { useMutation, useQuery, useSubscription } from '@apollo/client/react';
import { useEffect } from 'react';
import type { NotificationPage } from '@repo/shared';
import { useIsAuthenticated } from '@/stores/auth';

export const MY_NOTIFICATIONS = gql`
  query MyNotifications($first: Int!, $after: String) {
    myNotifications(first: $first, after: $after) {
      notifications {
        id
        kind
        eventId
        entryId
        competitorId
        competitorName
        status
        raceTime
        controlCode
        splitTime
        eventName
        itemCount
        amount
        currency
        method
        createdAt
        readAt
      }
      unreadCount
      endCursor
      hasNextPage
    }
  }
`;
const CHANGED = gql`
  subscription MyNotificationsChanged {
    myNotificationsChanged
  }
`;
const MARK_READ = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;
const MARK_ALL_READ = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

export function useNotifications(after: string | null = null) {
  const authenticated = useIsAuthenticated();
  const query = useQuery<{ myNotifications: NotificationPage }>(
    MY_NOTIFICATIONS,
    {
      variables: { first: 20, after },
      skip: !authenticated,
      fetchPolicy: 'network-only',
      pollInterval: 30_000,
      skipPollAttempt: () => document.hidden,
      notifyOnNetworkStatusChange: true,
    }
  );
  const { refetch } = query;
  useSubscription(CHANGED, {
    skip: !authenticated,
    onData: () => {
      void refetch().catch(() => {});
    },
  });
  useEffect(() => {
    if (!authenticated) return;
    const reconcile = () => {
      if (!document.hidden) void refetch().catch(() => {});
    };
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [authenticated, refetch]);
  return {
    ...query,
    data: authenticated ? query.data?.myNotifications : undefined,
  };
}

export function useMarkAsRead() {
  return useMutation(MARK_READ, {
    refetchQueries: ['MyNotifications'],
    awaitRefetchQueries: true,
  });
}

export function useMarkAllAsRead() {
  return useMutation(MARK_ALL_READ, {
    refetchQueries: ['MyNotifications'],
    awaitRefetchQueries: true,
  });
}
