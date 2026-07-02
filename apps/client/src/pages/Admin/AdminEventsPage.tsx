import { Link } from '@tanstack/react-router';
import { format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/atoms';
import {
  AdminEventsTableHeader,
  AppDataTable,
  AppPagination,
  AppRowsPerPage,
  type AdminEventSortColumn,
  type AdminEventTextFilterColumn,
  type DateRangeValue,
} from '@/components/organisms';
import { TableCell, TableRow } from '@/components/ui/table';
import { applyTimeToDate } from '@/lib/date';
import { PATHNAMES } from '@/lib/paths/pathnames';
import { AdminPageLayout } from '@/templates';

import { useAdminEventsQuery } from './admin.hooks';
import { getEventSortValue } from './admin.tableHelpers';

function formatDate(value: string | Date) {
  return format(new Date(value), 'dd.MM.yyyy');
}

export function AdminEventsPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, isLoading, error } = useAdminEventsQuery({
    page,
    limit: pageSize,
  });

  const [sortConfig, setSortConfig] = useState<{
    column: AdminEventSortColumn;
    direction: 'asc' | 'desc';
  }>({ column: 'date', direction: 'desc' });
  const [textFilters, setTextFilters] = useState<
    Record<AdminEventTextFilterColumn, string>
  >({ name: '', organizer: '', authorName: '' });
  const [dateRange, setDateRange] = useState<DateRangeValue>({
    range: undefined,
    fromTime: '',
    toTime: '',
  });
  const [disciplineFilters, setDisciplineFilters] = useState<string[]>([]);
  const [publishedFilters, setPublishedFilters] = useState<string[]>([]);
  const [rankingFilters, setRankingFilters] = useState<string[]>([]);

  const handleSort = (column: AdminEventSortColumn) => {
    setSortConfig(prev =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' }
    );
  };

  const updateTextFilter = (
    column: AdminEventTextFilterColumn,
    value: string
  ) => {
    setTextFilters(prev => ({ ...prev, [column]: value.toLowerCase() }));
  };

  const visibleEvents = useMemo(() => {
    const items = data?.items ?? [];

    const filtered = items.filter(event => {
      if (
        textFilters.name &&
        !event.name.toLowerCase().includes(textFilters.name)
      ) {
        return false;
      }
      if (
        textFilters.organizer &&
        !(event.organizer ?? '').toLowerCase().includes(textFilters.organizer)
      ) {
        return false;
      }
      if (
        textFilters.authorName &&
        !(event.authorName ?? '')
          .toLowerCase()
          .includes(textFilters.authorName)
      ) {
        return false;
      }
      if (
        disciplineFilters.length > 0 &&
        !disciplineFilters.includes(event.discipline)
      ) {
        return false;
      }
      if (
        publishedFilters.length > 0 &&
        !publishedFilters.includes(String(event.published))
      ) {
        return false;
      }
      if (
        rankingFilters.length > 0 &&
        !rankingFilters.includes(String(event.ranking))
      ) {
        return false;
      }
      if (dateRange.range?.from || dateRange.range?.to) {
        const itemTime = new Date(event.date).getTime();
        const fromTime = dateRange.range?.from
          ? applyTimeToDate(
              dateRange.range.from,
              dateRange.fromTime || '00:00:00'
            ).getTime()
          : null;
        const toTime = dateRange.range?.to
          ? applyTimeToDate(
              dateRange.range.to,
              dateRange.toTime || '23:59:59'
            ).getTime()
          : null;
        if (fromTime && itemTime < fromTime) return false;
        if (toTime && itemTime > toTime) return false;
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const aValue = getEventSortValue(a, sortConfig.column);
      const bValue = getEventSortValue(b, sortConfig.column);

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    data,
    textFilters,
    disciplineFilters,
    publishedFilters,
    rankingFilters,
    dateRange,
    sortConfig,
  ]);

  useEffect(() => {
    if (!data) return;
    const totalPages = Math.max(1, Math.ceil(data.total / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [data, page, pageSize]);

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
            data={visibleEvents}
            isLoading={isLoading}
            error={error}
            columnCount={7}
            emptyStateText={t('Pages.Admin.Table.Empty')}
            renderToolbar={
              <AppRowsPerPage
                pageSize={pageSize}
                onPageSizeChange={size => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            }
            renderPagination={
              <AppPagination
                page={page}
                pageSize={pageSize}
                totalItems={data?.total ?? 0}
                onPageChange={setPage}
              />
            }
            renderHeader={
              <AdminEventsTableHeader
                sortConfig={sortConfig}
                onSort={handleSort}
                textFilters={textFilters}
                onTextFilterChange={updateTextFilter}
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
                disciplineFilters={disciplineFilters}
                onDisciplineFiltersChange={setDisciplineFilters}
                publishedFilters={publishedFilters}
                onPublishedFiltersChange={setPublishedFilters}
                rankingFilters={rankingFilters}
                onRankingFiltersChange={setRankingFilters}
              />
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
