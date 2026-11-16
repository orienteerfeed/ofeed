import { gql } from '@apollo/client';
import { useQuery, useSubscription } from '@apollo/client/react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSecondsToTime, formatTimeToHms } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { CompetitorName } from './CompetitorName';
import { FavoriteCompetitorButton } from './FavoriteCompetitorButton';
import { useEventFavorites } from './EventFavoritesProvider';
import { shouldDisplayResultTimes } from './result-list.utils';
import { formatCompetitorStatus } from '@/lib/competitor-status';

const FAVORITE_COMPETITORS = gql`
  query EventFavoriteCompetitors($eventId: String!, $competitorIds: [Int!]!) {
    eventFavoriteCompetitors(eventId: $eventId, competitorIds: $competitorIds) {
      id
      firstname
      lastname
      registration
      organisation
      status
      startTime
      finishTime
      time
      class {
        id
        name
        resultListMode
      }
      radioSplits {
        controlCode
        time
      }
    }
  }
`;
const RESULT_CHANGED = gql`
  subscription FavoriteCompetitorUpdated($eventId: String!) {
    competitorUpdated(eventId: $eventId) {
      id
    }
  }
`;
type FavoriteRow = {
  id: number | string;
  firstname: string;
  lastname: string;
  registration: string;
  organisation: string | null;
  status: string | null;
  startTime: string | null;
  finishTime: string | null;
  time: number | null;
  class: { id: number; name: string; resultListMode?: string | null };
  radioSplits: Array<{ controlCode: number; time: number | null }>;
};

export function EventFavoritesView() {
  const favorites = useEventFavorites();
  const { t } = useTranslation();
  const ids = useMemo(
    () => [...(favorites?.ids ?? [])].sort((a, b) => a - b),
    [favorites?.ids]
  );
  const query = useQuery<{ eventFavoriteCompetitors: FavoriteRow[] }>(
    FAVORITE_COMPETITORS,
    {
      variables: { eventId: favorites?.eventId ?? '', competitorIds: ids },
      skip: !favorites || !ids.length,
      fetchPolicy: 'network-only',
      pollInterval: 30_000,
      skipPollAttempt: () => document.hidden,
    }
  );
  const { refetch } = query;
  useSubscription(RESULT_CHANGED, {
    variables: { eventId: favorites?.eventId ?? '' },
    skip: !favorites || !ids.length,
    onData: () => {
      void refetch().catch(() => {});
    },
  });
  useEffect(() => {
    if (!ids.length) return;
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
  }, [ids.length, refetch]);
  if (!favorites) return null;
  return (
    <section className="space-y-4" aria-label={t('Favorites.Title')}>
      <p className="text-sm text-muted-foreground">
        {favorites.authenticated
          ? t('Favorites.AccountHint')
          : t('Favorites.GuestHint')}
      </p>
      {(favorites.loading || query.loading) && (
        <p role="status">{t('Notifications.Loading')}</p>
      )}
      {query.error && (
        <div role="alert">
          <p>{t('Favorites.LoadError')}</p>
          <Button
            variant="outline"
            onClick={() => {
              void refetch().catch(() => {});
            }}
          >
            {t('Notifications.Retry')}
          </Button>
        </div>
      )}
      {!favorites.loading && !ids.length && (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">
          {t('Favorites.Empty')}
        </p>
      )}
      {!!ids.length &&
        !query.loading &&
        !query.error &&
        !query.data?.eventFavoriteCompetitors.length && (
          <p>{t('Favorites.Unavailable')}</p>
        )}
      {!favorites.authenticated &&
        !query.loading &&
        !query.error &&
        query.data &&
        query.data.eventFavoriteCompetitors.length < ids.length && (
          <Button
            variant="outline"
            onClick={() => {
              const available = new Set(
                query.data?.eventFavoriteCompetitors.map(row => Number(row.id))
              );
              void (async () => {
                for (const id of ids)
                  if (!available.has(id)) await favorites.toggle(id);
              })();
            }}
          >
            {t('Favorites.RemoveUnavailable')}
          </Button>
        )}
      {!!ids.length && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {query.data?.eventFavoriteCompetitors
            .filter(row => favorites.ids.has(Number(row.id)))
            .map(row => (
              <li key={row.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold">
                      <CompetitorName competitor={row} />
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {row.class.name} · {row.registration || row.organisation}
                    </p>
                  </div>
                  <FavoriteCompetitorButton competitorId={row.id} />
                </div>
                <p className="mt-2 text-sm">
                  {formatCompetitorStatus(row.status, t)}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t('Favorites.Start')}
                    </dt>
                    <dd>
                      {row.startTime ? formatTimeToHms(row.startTime) : '—'}
                    </dd>
                  </div>
                  {shouldDisplayResultTimes(row.class.resultListMode) && (
                    <div>
                      <dt className="text-muted-foreground">
                        {t('Favorites.Time')}
                      </dt>
                      <dd>
                        {row.time !== null
                          ? formatSecondsToTime(row.time)
                          : '—'}
                      </dd>
                    </div>
                  )}
                </dl>
                {shouldDisplayResultTimes(row.class.resultListMode) &&
                  !!row.radioSplits.length && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {row.radioSplits
                        .map(
                          split =>
                            `${split.controlCode}: ${split.time === null ? '—' : formatSecondsToTime(split.time)}`
                        )
                        .join(' · ')}
                    </p>
                  )}
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
