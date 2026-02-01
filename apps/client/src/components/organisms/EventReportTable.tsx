import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/atoms';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, MoreHorizontal, Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ReportPagination } from './ReportPagination';
import { ReportRowsPerPage } from './ReportRowsPerPage';
import { ReportTableEmptyState } from './ReportTableEmptyState';
import {
  ReportTableHeader,
  type SelectOption,
  type DateRangeValue,
} from './ReportTableHeader';
import { ReportTableRow } from './ReportTableRow';

export type ChangelogEntry = {
  id: number;
  competitorId: number;
  competitor: {
    lastname: string;
    firstname: string;
    classId: number | null;
  };
  origin: string;
  type: string;
  previousValue: string | null;
  newValue: string | null;
  author?: {
    firstname: string;
    lastname: string;
  } | null;
  createdAt: string;
};

export type SortColumn =
  | 'id'
  | 'createdAt'
  | 'type'
  | 'competitorId'
  | 'lastname'
  | 'firstname'
  | 'previousValue'
  | 'newValue'
  | 'origin';

export type ColumnFilter = Exclude<SortColumn, 'type' | 'origin' | 'createdAt'>;

type EventReportTableProps = {
  data: ChangelogEntry[];
  isLoading: boolean;
  error?: Error | string | null | undefined;
  page: number;
  pageSize: number;
  totalItems: number;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
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
  processedItems: Set<string>;
  onToggleProcessed: (id: number, checked: boolean) => void;
};

export const EventReportTable = ({
  data,
  isLoading,
  error,
  page,
  pageSize,
  totalItems,
  onExportCsv,
  onExportPdf,
  onPageChange,
  onPageSizeChange,
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
  processedItems,
  onToggleProcessed,
}: EventReportTableProps) => {
  const { t } = useTranslation();
  const isEmpty = data.length === 0;
  const showEmptyState = isLoading || !!error || isEmpty;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2 sm:justify-between">
        <div className="hidden sm:block">
          <ReportRowsPerPage
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Button type="button" variant="outline" onClick={onExportCsv}>
              <Download className="h-4 w-4" />
              {t('Pages.Event.Report.Buttons.ExportCsv')}
            </Button>
            <Button type="button" variant="outline" onClick={onExportPdf}>
              <Printer className="h-4 w-4" />
              {t('Pages.Event.Report.Buttons.ExportPdf')}
            </Button>
          </div>
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onExportCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('Pages.Event.Report.Buttons.ExportCsv')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onExportPdf}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t('Pages.Event.Report.Buttons.ExportPdf')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
        <ReportTableHeader
          sortConfig={sortConfig}
          onSort={onSort}
          columnFilters={columnFilters}
          onColumnFilterChange={onColumnFilterChange}
          onNumericFilterChange={onNumericFilterChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          typeFilters={typeFilters}
          onTypeFiltersChange={onTypeFiltersChange}
          originFilters={originFilters}
          onOriginFiltersChange={onOriginFiltersChange}
          typeOptions={typeOptions}
          originOptions={originOptions}
        />
        <TableBody>
          {showEmptyState ? (
            <TableRow>
              <TableCell colSpan={10} className="py-8">
                <div className="flex items-center justify-center">
                  <ReportTableEmptyState isLoading={isLoading} error={error} />
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map(item => {
              const isProcessed = processedItems.has(item.id.toString());
              return (
                <ReportTableRow
                  key={item.id}
                  item={item}
                  isProcessed={isProcessed}
                  onToggleProcessed={onToggleProcessed}
                />
              );
            })
          )}
        </TableBody>
      </Table>
      </div>
      <ReportPagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        onPageChange={onPageChange}
      />
    </div>
  );
};

export const tableRowTone = (item: ChangelogEntry, isProcessed: boolean) => {
  if (isProcessed) return 'bg-emerald-50 dark:bg-emerald-950/40';
  if (item.type === 'si_card_change') {
    return 'bg-amber-50 dark:bg-amber-950/30';
  }
  if (item.type === 'status_change' && item.newValue === 'DidNotStart') {
    return 'bg-rose-50 dark:bg-rose-950/30';
  }
  return '';
};
