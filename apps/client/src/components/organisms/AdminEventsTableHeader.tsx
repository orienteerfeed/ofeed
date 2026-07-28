import { Input } from '@/components/atoms';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AppDateRangeFilter,
  AppMultiSelectFilter,
  type DateRangeValue,
} from './AppTableFilters';
import { AppTableHeader, type AppTableColumn } from './AppTableHeader';

export type AdminEventSortColumn =
  | 'name'
  | 'date'
  | 'organizer'
  | 'discipline'
  | 'authorName'
  | 'published'
  | 'ranking';

export type AdminEventTextFilterColumn = 'name' | 'organizer' | 'authorName';

const DISCIPLINE_VALUES = [
  'SPRINT',
  'MIDDLE',
  'LONG',
  'ULTRALONG',
  'NIGHT',
  'KNOCKOUT_SPRINT',
  'RELAY',
  'SPRINT_RELAY',
  'TEAMS',
  'OTHER',
] as const;

export type AdminEventsTableHeaderProps = {
  sortConfig: { column: AdminEventSortColumn; direction: 'asc' | 'desc' };
  onSort: (column: AdminEventSortColumn) => void;
  textFilters: Record<AdminEventTextFilterColumn, string>;
  onTextFilterChange: (
    column: AdminEventTextFilterColumn,
    value: string
  ) => void;
  dateRange: DateRangeValue;
  onDateRangeChange: (next: DateRangeValue) => void;
  disciplineFilters: string[];
  onDisciplineFiltersChange: (next: string[]) => void;
  publishedFilters: string[];
  onPublishedFiltersChange: (next: string[]) => void;
  rankingFilters: string[];
  onRankingFiltersChange: (next: string[]) => void;
  showOwner?: boolean;
};

export const AdminEventsTableHeader = ({
  sortConfig,
  onSort,
  textFilters,
  onTextFilterChange,
  dateRange,
  onDateRangeChange,
  disciplineFilters,
  onDisciplineFiltersChange,
  publishedFilters,
  onPublishedFiltersChange,
  rankingFilters,
  onRankingFiltersChange,
  showOwner = true,
}: AdminEventsTableHeaderProps) => {
  const { t } = useTranslation();

  const disciplineOptions = useMemo(
    () =>
      DISCIPLINE_VALUES.map(value => ({
        value,
        label: t(`Pages.Event.Form.DisciplineOptions.${value}`),
      })),
    [t]
  );

  const booleanOptions = useMemo(
    () => [
      { value: 'true', label: t('Pages.Admin.Table.Yes') },
      { value: 'false', label: t('Pages.Admin.Table.No') },
    ],
    [t]
  );

  const selectedCountLabel = (count: number) =>
    t('Pages.Event.Report.Filters.SelectedCount', { count });
  const clearLabel = t('Pages.Event.Report.Filters.ClearSelection');

  const columns: AppTableColumn<AdminEventSortColumn>[] = [
    {
      id: 'name',
      label: t('Pages.Admin.Table.Event'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Admin.Table.Filters.NamePlaceholder')}
          value={textFilters.name}
          onChange={event => onTextFilterChange('name', event.target.value)}
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'date',
      label: t('Pages.Admin.Table.Date'),
      sortable: true,
      filter: (
        <AppDateRangeFilter
          value={dateRange}
          onChange={onDateRangeChange}
          label={t('Pages.Event.Report.Filters.DateRange')}
          fromLabel={t('Pages.Event.Report.Filters.DateFrom')}
          toLabel={t('Pages.Event.Report.Filters.DateTo')}
          clearLabel={clearLabel}
          timeFromLabel={t('Pages.Event.Report.Filters.TimeFrom')}
          timeToLabel={t('Pages.Event.Report.Filters.TimeTo')}
        />
      ),
    },
    {
      id: 'organizer',
      label: t('Pages.Admin.Table.Organizer'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Admin.Table.Filters.OrganizerPlaceholder')}
          value={textFilters.organizer}
          onChange={event =>
            onTextFilterChange('organizer', event.target.value)
          }
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'discipline',
      label: t('Pages.Admin.Table.Discipline'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Admin.Table.Filters.DisciplinePlaceholder')}
          options={disciplineOptions}
          selected={disciplineFilters}
          onChange={onDisciplineFiltersChange}
          selectedCountLabel={selectedCountLabel}
          clearLabel={clearLabel}
        />
      ),
    },
  ];

  if (showOwner) {
    columns.push({
      id: 'authorName',
      label: t('Pages.Admin.Table.Owner'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Admin.Table.Filters.OwnerPlaceholder')}
          value={textFilters.authorName}
          onChange={event =>
            onTextFilterChange('authorName', event.target.value)
          }
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    });
  }

  columns.push(
    {
      id: 'published',
      label: t('Pages.Admin.Table.Published'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Admin.Table.Filters.PublishedPlaceholder')}
          options={booleanOptions}
          selected={publishedFilters}
          onChange={onPublishedFiltersChange}
          selectedCountLabel={selectedCountLabel}
          clearLabel={clearLabel}
        />
      ),
    },
    {
      id: 'ranking',
      label: t('Pages.Admin.Table.Ranking'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Admin.Table.Filters.RankingPlaceholder')}
          options={booleanOptions}
          selected={rankingFilters}
          onChange={onRankingFiltersChange}
          selectedCountLabel={selectedCountLabel}
          clearLabel={clearLabel}
        />
      ),
    }
  );

  const columnOrder = columns.map(column => column.id);

  return (
    <AppTableHeader
      columns={columns}
      columnOrder={columnOrder}
      sortConfig={sortConfig}
      onSort={onSort}
    />
  );
};
