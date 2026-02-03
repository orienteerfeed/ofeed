import { Badge, Checkbox } from '@/components/atoms';
import { AppTableRow } from '@/components/organisms';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { ChangelogEntry, SortColumn } from '@/types/reportTable';

const typeBadgeClassName: Record<string, string> = {
  status_change: 'bg-blue-100 text-blue-800 border-blue-200',
  si_card_change: 'bg-amber-100 text-amber-800 border-amber-200',
  note_change: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  late_start_change: 'bg-slate-100 text-slate-800 border-slate-200',
};

type ReportTableRowProps = {
  item: ChangelogEntry;
  isProcessed: boolean;
  onToggleProcessed: (id: number, checked: boolean) => void;
  columnOrder: SortColumn[];
  onRowClick?: (item: ChangelogEntry) => void;
};

const tableRowTone = (item: ChangelogEntry, isProcessed: boolean) => {
  if (isProcessed) return 'bg-emerald-50 dark:bg-emerald-950/40';
  if (item.type === 'si_card_change') {
    return 'bg-amber-50 dark:bg-amber-950/30';
  }
  if (item.type === 'status_change' && item.newValue === 'DidNotStart') {
    return 'bg-rose-50 dark:bg-rose-950/30';
  }
  return '';
};

export const ReportTableRow = ({
  item,
  isProcessed,
  onToggleProcessed,
  columnOrder,
  onRowClick,
}: ReportTableRowProps) => {
  const { t } = useTranslation();
  const rowTone = tableRowTone(item, isProcessed);
  const typeLabel = t(`Pages.Event.Report.TypeLabels.${item.type}`, {
    defaultValue: item.type,
  });
  const originLabel = t(`Pages.Event.Report.OriginLabels.${item.origin}`, {
    defaultValue: item.origin ?? '-',
  });

  const cellByColumn: Record<string, ReactNode> = {
    id: item.id,
    createdAt: new Date(item.createdAt).toLocaleString('cs-CZ'),
    origin: originLabel,
    type: (
      <Badge
        variant="outline"
        className={cn(
          'capitalize',
          typeBadgeClassName[item.type] ??
            'bg-violet-100 text-violet-800 border-violet-200'
        )}
      >
        {typeLabel}
      </Badge>
    ),
    lastname: item.competitor?.lastname ?? '-',
    firstname: item.competitor?.firstname ?? '-',
    competitorId: item.competitorId,
    previousValue: item.previousValue ?? '-',
    newValue: item.newValue ?? '-',
  };

  return (
    <AppTableRow
      rowClassName={rowTone}
      leadingCellClassName="w-10"
      leadingCell={
        <div onClick={event => event.stopPropagation()}>
          <Checkbox
            checked={isProcessed}
            onCheckedChange={value =>
              onToggleProcessed(item.id, value === true)
            }
          />
        </div>
      }
      columnOrder={columnOrder}
      cellByColumn={cellByColumn}
      onRowClick={onRowClick ? () => onRowClick(item) : undefined}
    />
  );
};
