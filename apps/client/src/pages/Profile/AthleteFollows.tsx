import { gql } from '@apollo/client';
import { useMutation, useQuery, useSubscription } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, Trash2 } from 'lucide-react';
import type { AthleteFollow } from '@repo/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export const MY_ATHLETE_FOLLOWS = gql`
  query MyAthleteFollows {
    myAthleteFollows {
      id
      registration
      source
      displayName
      pausedAt
      createdAt
    }
  }
`;
const PAUSE_FOLLOW = gql`
  mutation SetAthleteFollowPaused($id: ID!, $paused: Boolean!) {
    setAthleteFollowPaused(id: $id, paused: $paused)
  }
`;
const REMOVE_FOLLOW = gql`
  mutation RemoveAthleteFollow($id: ID!) {
    removeAthleteFollow(id: $id)
  }
`;
const CHANGED = gql`
  subscription AthleteFollowsChanged {
    myNotificationsChanged
  }
`;

export function AthleteFollows() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useQuery<{
    myAthleteFollows: AthleteFollow[];
  }>(MY_ATHLETE_FOLLOWS, {
    fetchPolicy: 'network-only',
    pollInterval: 30_000,
    skipPollAttempt: () => document.hidden,
  });
  const mutationOptions = {
    refetchQueries: ['MyAthleteFollows'],
    awaitRefetchQueries: true,
  };
  const [pause, pauseState] = useMutation(PAUSE_FOLLOW, mutationOptions);
  const [remove, removeState] = useMutation(REMOVE_FOLLOW, mutationOptions);
  const [removing, setRemoving] = useState<AthleteFollow | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = pauseState.loading || removeState.loading;
  useSubscription(CHANGED, {
    onData: () => {
      void refetch().catch(() => {});
    },
  });
  useEffect(() => {
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
  }, [refetch]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('AthleteFollows.Title')}</CardTitle>
        <CardDescription>{t('AthleteFollows.Description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data && <p role="status">{t('Notifications.Loading')}</p>}
        {error && (
          <div role="alert">
            <p>{t('AthleteFollows.LoadError')}</p>
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
        {failed && (
          <p className="text-destructive" role="alert">
            {t('AthleteFollows.ActionError')}
          </p>
        )}
        {!loading && !error && !data?.myAthleteFollows.length && (
          <p className="rounded-md border p-4 text-muted-foreground">
            {t('AthleteFollows.Empty')}
          </p>
        )}
        <ul className="divide-y rounded-md border empty:hidden">
          {data?.myAthleteFollows.map(follow => (
            <li
              key={follow.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words font-medium">{follow.displayName}</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-mono">{follow.registration}</span> ·{' '}
                  {follow.source === 'LOCAL'
                    ? t('AthleteFollows.LocalSource')
                    : follow.source}
                </p>
                <Badge
                  variant={follow.pausedAt ? 'secondary' : 'default'}
                  className="mt-1"
                >
                  {follow.pausedAt
                    ? t('AthleteFollows.Paused')
                    : t('AthleteFollows.Active')}
                </Badge>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={pending}
                  aria-label={t(
                    follow.pausedAt
                      ? 'AthleteFollows.ResumeLabel'
                      : 'AthleteFollows.PauseLabel',
                    { name: follow.displayName }
                  )}
                  onClick={() => {
                    setFailed(false);
                    void pause({
                      variables: { id: follow.id, paused: !follow.pausedAt },
                    }).catch(() => setFailed(true));
                  }}
                >
                  {follow.pausedAt ? (
                    <Play className="mr-2 h-4 w-4" />
                  ) : (
                    <Pause className="mr-2 h-4 w-4" />
                  )}
                  {follow.pausedAt
                    ? t('AthleteFollows.Resume')
                    : t('AthleteFollows.Pause')}
                </Button>
                <Button
                  variant="outline"
                  disabled={pending}
                  aria-label={t('AthleteFollows.RemoveLabel', {
                    name: follow.displayName,
                  })}
                  onClick={() => setRemoving(follow)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('AthleteFollows.Remove')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          {t('AthleteFollows.PauseHint')}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('AthleteFollows.EventOnlyHint')}
        </p>
      </CardContent>
      <AlertDialog
        open={!!removing}
        onOpenChange={open => {
          if (!open && !pending) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('AthleteFollows.ConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('AthleteFollows.ConfirmDescription', {
                name: removing?.displayName ?? '',
                registration: removing?.registration ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t('AthleteFollows.Keep')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={event => {
                event.preventDefault();
                if (!removing) return;
                setFailed(false);
                void remove({ variables: { id: removing.id } })
                  .then(() => setRemoving(null))
                  .catch(() => {
                    setFailed(true);
                    setRemoving(null);
                  });
              }}
            >
              {t('AthleteFollows.Remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
