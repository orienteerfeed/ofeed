import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/atoms';
import { AppDataTable } from '@/components/organisms';
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';

import { useAdminEventsQuery } from './admin.hooks';

function formatDate(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy');
}

export function AdminEventsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useAdminEventsQuery();

  return (
    <AdminPageLayout
      activeItem="events"
      breadcrumbs={[
        {
          label: t('Pages.Admin.Common.Zone'),
          to: PATHNAMES.adminDashboard().to,
        },
        { label: t('Pages.Admin.Navigation.Events') },
      ]}
    >
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="px-4 lg:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('Pages.Admin.Events.Title')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('Pages.Admin.Events.Description', { count: data?.total ?? 0 })}
          </p>
        </section>

        <section className="px-4 lg:px-6">
          <AppDataTable
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error}
            columnCount={7}
            emptyStateText={t('Pages.Admin.Table.Empty')}
            renderHeader={
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Pages.Admin.Table.Event')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Date')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Organizer')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Discipline')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Owner')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Published')}</TableHead>
                  <TableHead>{t('Pages.Admin.Table.Ranking')}</TableHead>
                </TableRow>
              </TableHeader>
            }
            renderRow={event => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">
                  <Link
                    {...PATHNAMES.eventDetail(event.id)}
                    className="transition-colors hover:text-primary"
                  >
                    {event.name}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(event.date)}</TableCell>
                <TableCell>{event.organizer || '—'}</TableCell>
                <TableCell>
                  {t(`Pages.Event.Form.DisciplineOptions.${event.discipline}`)}
                </TableCell>
                <TableCell>{event.authorName || '—'}</TableCell>
                <TableCell>
                  <Badge variant={event.published ? 'default' : 'secondary'}>
                    {event.published
                      ? t('Pages.Admin.Table.Yes')
                      : t('Pages.Admin.Table.No')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={event.ranking ? 'default' : 'secondary'}>
                    {event.ranking
                      ? t('Pages.Admin.Table.Yes')
                      : t('Pages.Admin.Table.No')}
                  </Badge>
                </TableCell>
              </TableRow>
            )}
          />
        </section>
      </div>
    </AdminPageLayout>
  );
}
