import { Button, Checkbox, Input } from '@/components/atoms';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  ArrowUpDown,
  CalendarIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { DateRange } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { ColumnFilter, SortColumn } from './EventReportTable';

export type SelectOption = { value: string; label: string };
export type DateRangeValue = {
  range: DateRange | undefined;
  fromTime: string;
  toTime: string;
};

export type ReportTableHeaderProps = {
  sortConfig: { column: SortColumn; direction: 'asc' | 'desc' };
  onSort: (column: SortColumn) => void;
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
  return (
    <TableHeader className="bg-muted/40">
      <TableRow>
        <TableHead className="w-10"></TableHead>
        {renderHeaderCell(
          t('Pages.Event.Report.Table.Id'),
          'id',
          sortConfig,
          onSort,
          () => (
            <Input
              placeholder={t('Pages.Event.Report.Filters.IdPlaceholder')}
              value={columnFilters.id}
              onChange={event =>
                onNumericFilterChange('id', event.target.value)
              }
              inputMode="numeric"
              type="number"
              className="mt-2 h-8 bg-background text-xs"
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.DateTime'),
          'createdAt',
          sortConfig,
          onSort,
          () => (
            <DateRangeFilter
              value={dateRange}
              onChange={onDateRangeChange}
              label={t('Pages.Event.Report.Filters.DateRange')}
              fromLabel={t('Pages.Event.Report.Filters.DateFrom')}
              toLabel={t('Pages.Event.Report.Filters.DateTo')}
              clearLabel={t('Pages.Event.Report.Filters.ClearSelection')}
              timeFromLabel={t('Pages.Event.Report.Filters.TimeFrom' as any, {
                defaultValue: 'Start time',
              })}
              timeToLabel={t('Pages.Event.Report.Filters.TimeTo' as any, {
                defaultValue: 'End time',
              })}
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.Type'),
          'type',
          sortConfig,
          onSort,
          () => (
            <MultiSelectDropdown
              placeholder={t('Pages.Event.Report.Filters.TypePlaceholder')}
              options={typeOptions}
              selected={typeFilters}
              onChange={onTypeFiltersChange}
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.CompetitorId'),
          'competitorId',
          sortConfig,
          onSort,
          () => (
            <Input
              placeholder={t(
                'Pages.Event.Report.Filters.CompetitorIdPlaceholder'
              )}
              value={columnFilters.competitorId}
              onChange={event =>
                onColumnFilterChange('competitorId', event.target.value)
              }
              className="mt-2 h-8 bg-background text-xs"
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.Lastname'),
          'lastname',
          sortConfig,
          onSort,
          () => (
            <Input
              placeholder={t('Pages.Event.Report.Filters.LastnamePlaceholder')}
              value={columnFilters.lastname}
              onChange={event =>
                onColumnFilterChange('lastname', event.target.value)
              }
              className="mt-2 h-8 bg-background text-xs"
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.Firstname'),
          'firstname',
          sortConfig,
          onSort,
          () => (
            <Input
              placeholder={t('Pages.Event.Report.Filters.FirstnamePlaceholder')}
              value={columnFilters.firstname}
              onChange={event =>
                onColumnFilterChange('firstname', event.target.value)
              }
              className="mt-2 h-8 bg-background text-xs"
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.PreviousValue'),
          'previousValue',
          sortConfig,
          onSort,
          () => (
            <Input
              placeholder={t(
                'Pages.Event.Report.Filters.PreviousValuePlaceholder'
              )}
              value={columnFilters.previousValue}
              onChange={event =>
                onColumnFilterChange('previousValue', event.target.value)
              }
              className="mt-2 h-8 bg-background text-xs"
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.NewValue'),
          'newValue',
          sortConfig,
          onSort,
          () => (
            <Input
              placeholder={t('Pages.Event.Report.Filters.NewValuePlaceholder')}
              value={columnFilters.newValue}
              onChange={event =>
                onColumnFilterChange('newValue', event.target.value)
              }
              className="mt-2 h-8 bg-background text-xs"
            />
          )
        )}
        {renderHeaderCell(
          t('Pages.Event.Report.Table.Origin'),
          'origin',
          sortConfig,
          onSort,
          () => (
            <MultiSelectDropdown
              placeholder={t('Pages.Event.Report.Filters.OriginPlaceholder')}
              options={originOptions}
              selected={originFilters}
              onChange={onOriginFiltersChange}
            />
          )
        )}
      </TableRow>
    </TableHeader>
  );
};

const renderHeaderCell = (
  label: string,
  column: SortColumn,
  sortConfig: { column: SortColumn; direction: 'asc' | 'desc' },
  onSort: (column: SortColumn) => void,
  filterSlot: () => ReactNode
) => {
  const isActive = sortConfig.column === column;
  const icon = !isActive ? (
    <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
  ) : sortConfig.direction === 'asc' ? (
    <ChevronUp className="h-3.5 w-3.5" />
  ) : (
    <ChevronDown className="h-3.5 w-3.5" />
  );

  return (
    <TableHead className="align-top py-3">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <span>{label}</span>
        {icon}
      </button>
      {filterSlot()}
    </TableHead>
  );
};

type MultiSelectDropdownProps = {
  placeholder: string;
  options: readonly SelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
};

const MultiSelectDropdown = ({
  placeholder,
  options,
  selected,
  onChange,
}: MultiSelectDropdownProps) => {
  const { t } = useTranslation();
  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(item => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : t('Pages.Event.Report.Filters.SelectedCount', {
          count: selected.length,
        });

  return (
    <div className="mt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between text-xs font-normal"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 max-h-64 overflow-auto p-2"
          align="start"
        >
          <div className="space-y-1">
            {options.map(option => {
              const isChecked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <Checkbox checked={isChecked} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-7 w-full text-xs"
              onClick={() => onChange([])}
            >
              {t('Pages.Event.Report.Filters.ClearSelection')}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

type DateRangeFilterProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  label: string;
  fromLabel: string;
  toLabel: string;
  clearLabel: string;
  timeFromLabel: string;
  timeToLabel: string;
};

const DateRangeFilter = ({
  value,
  onChange,
  label,
  fromLabel,
  toLabel,
  clearLabel,
  timeFromLabel,
  timeToLabel,
}: DateRangeFilterProps) => {
  const from = value.range?.from;
  const to = value.range?.to;
  const summary = from
    ? to
      ? `${format(from, 'd. M. yyyy')} – ${format(to, 'd. M. yyyy')}`
      : `${format(from, 'd. M. yyyy')} – …`
    : label;

  return (
    <div className="mt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-9 w-full justify-between px-3 text-left font-normal',
              !from && 'text-muted-foreground'
            )}
          >
            <span className="truncate">{summary}</span>
            <span className="ml-2 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 opacity-60" />
              <ChevronDown className="h-4 w-4 opacity-60" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="rounded-md border">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={value.range}
              onSelect={range =>
                onChange({
                  ...value,
                  range,
                })
              }
              className="p-0"
              {...(from ? { defaultMonth: from } : {})}
            />

            <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {timeFromLabel}
                </span>
                <Input
                  type="time"
                  step="1"
                  value={value.fromTime}
                  onChange={event =>
                    onChange({ ...value, fromTime: event.target.value })
                  }
                  className="h-9"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {timeToLabel}
                </span>
                <Input
                  type="time"
                  step="1"
                  value={value.toTime}
                  onChange={event =>
                    onChange({ ...value, toTime: event.target.value })
                  }
                  className="h-9"
                />
              </label>
            </div>

            <div className="flex items-center justify-between border-t p-3">
              <span className="text-xs text-muted-foreground">
                {fromLabel} / {toLabel}
              </span>
              {(value.range?.from || value.range?.to) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  onClick={() =>
                    onChange({ range: undefined, fromTime: '', toTime: '' })
                  }
                >
                  {clearLabel}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
