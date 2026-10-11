import { Input } from '@/components/atoms';
import { AppTableHeader, type AppTableColumn } from '@/components/organisms';
import {
  AppDateRangeFilter,
  AppMultiSelectFilter,
  type DateRangeValue,
  type SelectOption,
} from '@/components/organisms/AppTableFilters';
import { useTranslation } from 'react-i18next';
import { ColumnFilter, SortColumn } from '@/types/reportTable';

export type { DateRangeValue, SelectOption };

export type ReportTableHeaderProps = {
  sortConfig: { column: SortColumn; direction: 'asc' | 'desc' };
  onSort: (column: SortColumn) => void;
  columnOrder: SortColumn[];
  onColumnOrderChange?: (next: SortColumn[]) => void;
  columnFilters: Record<ColumnFilter, string>;
  onColumnFilterChange: (column: ColumnFilter, value: string) => void;
  onNumericFilterChange: (column: ColumnFilter, value: string) => void;
  dateRange: DateRangeValue;
  onDateRangeChange: (next: DateRangeValue) => void;
  typeFilters: string[];
  onTypeFiltersChange: (next: string[]) => void;
  originFilters: string[];
  onOriginFiltersChange: (next: string[]) => void;
  typeOptions: readonly SelectOption[];
  originOptions: readonly SelectOption[];
};

export const ReportTableHeader = ({
  sortConfig,
  onSort,
  columnOrder,
  onColumnOrderChange,
  columnFilters,
  onColumnFilterChange,
  onNumericFilterChange,
  dateRange,
  onDateRangeChange,
  typeFilters,
  onTypeFiltersChange,
  originFilters,
  onOriginFiltersChange,
  typeOptions,
  originOptions,
}: ReportTableHeaderProps) => {
  const { t } = useTranslation();
  const columns: AppTableColumn<SortColumn>[] = [
    {
      id: 'id',
      label: t('Pages.Event.Report.Table.Id'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Event.Report.Filters.IdPlaceholder')}
          value={columnFilters.id}
          onChange={event => onNumericFilterChange('id', event.target.value)}
          inputMode="numeric"
          type="number"
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'createdAt',
      label: t('Pages.Event.Report.Table.DateTime'),
      sortable: true,
      filter: (
        <AppDateRangeFilter
          value={dateRange}
          onChange={onDateRangeChange}
          label={t('Pages.Event.Report.Filters.DateRange')}
          fromLabel={t('Pages.Event.Report.Filters.DateFrom')}
          toLabel={t('Pages.Event.Report.Filters.DateTo')}
          clearLabel={t('Pages.Event.Report.Filters.ClearSelection')}
          timeFromLabel={t('Pages.Event.Report.Filters.TimeFrom', {
            defaultValue: 'Start time',
          })}
          timeToLabel={t('Pages.Event.Report.Filters.TimeTo', {
            defaultValue: 'End time',
          })}
        />
      ),
    },
    {
      id: 'origin',
      label: t('Pages.Event.Report.Table.Origin'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Event.Report.Filters.OriginPlaceholder')}
          options={originOptions}
          selected={originFilters}
          onChange={onOriginFiltersChange}
          selectedCountLabel={count =>
            t('Pages.Event.Report.Filters.SelectedCount', { count })
          }
          clearLabel={t('Pages.Event.Report.Filters.ClearSelection')}
        />
      ),
    },
    {
      id: 'type',
      label: t('Pages.Event.Report.Table.Type'),
      sortable: true,
      filter: (
        <AppMultiSelectFilter
          placeholder={t('Pages.Event.Report.Filters.TypePlaceholder')}
          options={typeOptions}
          selected={typeFilters}
          onChange={onTypeFiltersChange}
          selectedCountLabel={count =>
            t('Pages.Event.Report.Filters.SelectedCount', { count })
          }
          clearLabel={t('Pages.Event.Report.Filters.ClearSelection')}
        />
      ),
    },
    {
      id: 'lastname',
      label: t('Pages.Event.Report.Table.Lastname'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Event.Report.Filters.LastnamePlaceholder')}
          value={columnFilters.lastname}
          onChange={event => onColumnFilterChange('lastname', event.target.value)}
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'firstname',
      label: t('Pages.Event.Report.Table.Firstname'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Event.Report.Filters.FirstnamePlaceholder')}
          value={columnFilters.firstname}
          onChange={event =>
            onColumnFilterChange('firstname', event.target.value)
          }
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'competitorId',
      label: t('Pages.Event.Report.Table.CompetitorId'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Event.Report.Filters.CompetitorIdPlaceholder')}
          value={columnFilters.competitorId}
          onChange={event =>
            onColumnFilterChange('competitorId', event.target.value)
          }
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'previousValue',
      label: t('Pages.Event.Report.Table.PreviousValue'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Event.Report.Filters.PreviousValuePlaceholder')}
          value={columnFilters.previousValue}
          onChange={event =>
            onColumnFilterChange('previousValue', event.target.value)
          }
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
    {
      id: 'newValue',
      label: t('Pages.Event.Report.Table.NewValue'),
      sortable: true,
      filter: (
        <Input
          placeholder={t('Pages.Event.Report.Filters.NewValuePlaceholder')}
          value={columnFilters.newValue}
          onChange={event => onColumnFilterChange('newValue', event.target.value)}
          className="mt-2 h-8 bg-background text-xs"
        />
      ),
    },
  ];

  return (
    <AppTableHeader
      columns={columns}
      columnOrder={columnOrder}
      onColumnOrderChange={onColumnOrderChange}
      sortConfig={sortConfig}
      onSort={onSort}
      leadingCellClassName="w-10"
      leadingCell={<span className="sr-only">Select</span>}
    />
  );
};
