import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import type { NotificationPage, UserNotification } from '@repo/shared';
import { useMarkAllAsRead, useMarkAsRead } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatSecondsToTime } from '@/lib/date';
import { formatCompetitorStatus } from '@/lib/competitor-status';

const notificationTitleKeys = {
  ENTRY_ORDER_RECEIVED: 'Notifications.NewOrder',
  ENTRY_PAYMENT_RECEIVED: 'Notifications.NewPayment',
  COMPETITOR_STARTED: 'Favorites.Started',
  COMPETITOR_RADIO: 'Favorites.Radio',
  COMPETITOR_FINISHED: 'Favorites.Finished',
  COMPETITOR_READOUT: 'Favorites.Readout',
  COMPETITOR_RESULT_CHANGED: 'Favorites.Changed',
} as const;

export function NotificationInbox({
  data,
  loading,
  failed,
  retry,
  onSelect,
}: {
  data: NotificationPage | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  onSelect?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [markRead, readState] = useMarkAsRead();
  const [markAll, allState] = useMarkAllAsRead();
  const [actionFailed, setActionFailed] = useState(false);
  const select = async (notification: UserNotification) => {
    setActionFailed(false);
    try {
      if (!notification.readAt)
        await markRead({ variables: { id: notification.id } });
      onSelect?.();
      if (notification.competitorId) {
        await navigate({
          to: '/events/$eventId',
          params: { eventId: notification.eventId },
          search: { tab: 'favorites' },
        });
      } else if (notification.entryId)
        await navigate({
          to: '/events/$eventId/entries/$entryId',
          params: {
            eventId: notification.eventId,
            entryId: notification.entryId,
          },
        });
    } catch {
      setActionFailed(true);
    }
  };
  return (
    <div aria-busy={loading}>
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <h2 className="font-semibold">
          {t('Notifications.Title')}{' '}
          <span aria-live="polite">({data?.unreadCount ?? 0})</span>
        </h2>
        {!!data?.unreadCount && (
          <Button
            size="sm"
            variant="ghost"
            disabled={allState.loading}
            onClick={() => {
              setActionFailed(false);
              void markAll().catch(() => setActionFailed(true));
            }}
          >
            {t('Notifications.MarkAllRead')}
          </Button>
        )}
      </div>
      {loading && !data && (
        <p className="p-4" role="status">
          {t('Notifications.Loading')}
        </p>
      )}
      {failed && (
        <div className="p-4" role="alert">
          <p>{t('Notifications.LoadError')}</p>
          <Button variant="outline" onClick={retry}>
            {t('Notifications.Retry')}
          </Button>
        </div>
      )}
      {actionFailed && (
        <p className="p-4 text-destructive" role="alert">
          {t('Notifications.ActionError')}
        </p>
      )}
      {!loading && !failed && !data?.notifications.length && (
        <p className="p-4 text-sm text-muted-foreground">
          {t('Notifications.Empty')}
        </p>
      )}
      <ul className="divide-y">
        {data?.notifications.map(notification => (
          <li key={notification.id}>
            <button
              type="button"
              className={cn(
                'w-full p-4 text-left hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring',
                !notification.readAt && 'bg-muted/50'
              )}
              disabled={readState.loading}
              onClick={() => {
                void select(notification);
              }}
            >
              <span className="flex items-center gap-2 font-medium">
                {!notification.readAt && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-primary"
                    aria-label={t('Notifications.Unread')}
                  />
                )}
                {t(notificationTitleKeys[notification.kind])}
              </span>
              <span className="mt-1 block break-words text-sm">
                {notification.eventName}
              </span>
              <span className="block text-sm text-muted-foreground">
                {notification.kind === 'ENTRY_ORDER_RECEIVED'
                  ? t('Notifications.OrderDetails', {
                      count: notification.itemCount ?? 0,
                    })
                  : notification.kind !== 'ENTRY_PAYMENT_RECEIVED'
                    ? notification.kind === 'COMPETITOR_STARTED'
                      ? notification.competitorName
                      : notification.kind === 'COMPETITOR_RADIO'
                        ? t('Favorites.RadioDetails', {
                            name: notification.competitorName ?? '',
                            code: notification.controlCode ?? '—',
                            time:
                              notification.splitTime == null
                                ? '—'
                                : formatSecondsToTime(notification.splitTime),
                          })
                        : t('Favorites.CompetitorDetails', {
                            name: notification.competitorName ?? '',
                            status: formatCompetitorStatus(
                              notification.status,
                              t
                            ),
                            time:
                              notification.raceTime == null
                                ? '—'
                                : formatSecondsToTime(notification.raceTime),
                          })
                    : t('Notifications.PaymentDetails', {
                        amount: new Intl.NumberFormat(i18n.resolvedLanguage, {
                          style: 'currency',
                          currency: notification.currency ?? 'CZK',
                        }).format(Number(notification.amount)),
                        method:
                          notification.method === 'CASH'
                            ? t('Notifications.Cash')
                            : t('Notifications.Qr'),
                      })}
              </span>
              <time
                className="mt-1 block text-xs text-muted-foreground"
                dateTime={notification.createdAt}
              >
                {new Date(notification.createdAt).toLocaleString(
                  i18n.resolvedLanguage
                )}
              </time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
