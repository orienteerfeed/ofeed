import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MainPageLayout } from '@/templates';
import { Button } from '@/components/ui/button';
import { NotificationInbox } from '@/components/molecules/NotificationInbox';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationsPage() {
  const { t } = useTranslation();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const { data, loading, error, refetch } = useNotifications(
    cursors[cursors.length - 1]
  );
  return (
    <MainPageLayout t={t}>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-bold">{t('Notifications.Title')}</h1>
        <div className="overflow-hidden rounded-lg border">
          <NotificationInbox
            data={data}
            loading={loading}
            failed={!!error}
            retry={() => {
              void refetch().catch(() => {});
            }}
          />
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <Button
            variant="outline"
            disabled={loading || cursors.length === 1}
            onClick={() => setCursors(values => values.slice(0, -1))}
          >
            {t('Notifications.Previous')}
          </Button>
          <Button
            variant="outline"
            disabled={loading || !data?.hasNextPage}
            onClick={() => {
              if (data?.endCursor)
                setCursors(values => [...values, data.endCursor]);
            }}
          >
            {t('Notifications.Next')}
          </Button>
        </div>
      </div>
    </MainPageLayout>
  );
}
