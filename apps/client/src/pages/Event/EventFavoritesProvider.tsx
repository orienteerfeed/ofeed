import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { gql } from '@apollo/client';
import { useMutation, useQuery, useSubscription } from '@apollo/client/react';
import { useTranslation } from 'react-i18next';
import { useIsAuthenticated } from '@/stores/auth';

const MY_FAVORITES = gql`
  query MyEventFavoriteIds($eventId: String!) {
    myEventFavoriteCompetitorIds(eventId: $eventId)
  }
`;
const SET_FAVORITE = gql`
  mutation SetCompetitorFavorite(
    $eventId: String!
    $competitorId: Int!
    $favorite: Boolean!
  ) {
    setCompetitorFavorite(
      eventId: $eventId
      competitorId: $competitorId
      favorite: $favorite
    )
  }
`;
const FAVORITES_CHANGED = gql`
  subscription EventFavoriteSelectionChanged {
    myNotificationsChanged
  }
`;

type FavoritesContextValue = {
  eventId: string;
  ids: ReadonlySet<number>;
  authenticated: boolean;
  loading: boolean;
  pending: boolean;
  toggle: (competitorId: number) => Promise<void>;
};
const FavoritesContext = createContext<FavoritesContextValue | null>(null);
export const useEventFavorites = () => useContext(FavoritesContext);
export const guestFavoritesKey = (eventId: string) =>
  `ofeed:competitor-favorites:${eventId}`;

export function readGuestFavorites(eventId: string): number[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(guestFavoritesKey(eventId)) ?? '[]'
    );
    if (!Array.isArray(value)) return [];
    return [
      ...new Set(
        value.filter(
          (id): id is number =>
            typeof id === 'number' &&
            Number.isSafeInteger(id) &&
            id > 0 &&
            id <= 2147483647
        )
      ),
    ].slice(0, 100);
  } catch {
    return [];
  }
}

export function EventFavoritesProvider({
  eventId,
  children,
}: {
  eventId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const authenticated = useIsAuthenticated();
  const [guestIds, setGuestIds] = useState(() => readGuestFavorites(eventId));
  const [failed, setFailed] = useState(false);
  const query = useQuery<{ myEventFavoriteCompetitorIds: number[] }>(
    MY_FAVORITES,
    {
      variables: { eventId },
      skip: !authenticated,
      fetchPolicy: 'network-only',
      pollInterval: 30_000,
      skipPollAttempt: () => document.hidden,
    }
  );
  const { refetch } = query;
  const [setFavorite, mutation] = useMutation(SET_FAVORITE, {
    refetchQueries: ['MyEventFavoriteIds', 'EventFavoriteCompetitors'],
    awaitRefetchQueries: true,
  });
  useSubscription(FAVORITES_CHANGED, {
    skip: !authenticated,
    onData: () => {
      void refetch().catch(() => {});
    },
  });
  useEffect(() => {
    const reconcile = () => {
      if (authenticated) {
        if (!document.hidden) void refetch().catch(() => {});
      } else setGuestIds(readGuestFavorites(eventId));
    };
    window.addEventListener('storage', reconcile);
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.removeEventListener('storage', reconcile);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [authenticated, eventId, refetch]);
  const ids = useMemo(
    () =>
      new Set(
        authenticated
          ? (query.data?.myEventFavoriteCompetitorIds ?? [])
          : guestIds
      ),
    [authenticated, guestIds, query.data]
  );
  const toggle = async (competitorId: number) => {
    if (!Number.isSafeInteger(competitorId) || competitorId <= 0) return;
    setFailed(false);
    const favorite = !ids.has(competitorId);
    if (favorite && ids.size >= 100) {
      setFailed(true);
      return;
    }
    try {
      if (authenticated)
        await setFavorite({ variables: { eventId, competitorId, favorite } });
      else {
        const next = new Set(readGuestFavorites(eventId));
        if (favorite) next.add(competitorId);
        else next.delete(competitorId);
        const values = [...next];
        localStorage.setItem(
          guestFavoritesKey(eventId),
          JSON.stringify(values)
        );
        setGuestIds(values);
      }
    } catch {
      setFailed(true);
    }
  };
  return (
    <FavoritesContext.Provider
      value={{
        eventId,
        ids,
        authenticated,
        loading: authenticated && query.loading,
        pending: mutation.loading,
        toggle,
      }}
    >
      {(failed || query.error) && (
        <div
          className="mb-4 rounded-md border border-destructive p-3"
          role="alert"
        >
          <p>{t('Favorites.UpdateError')}</p>
          {query.error && (
            <button
              type="button"
              className="underline"
              onClick={() => {
                void refetch().catch(() => {});
              }}
            >
              {t('Notifications.Retry')}
            </button>
          )}
        </div>
      )}
      {children}
    </FavoritesContext.Provider>
  );
}
