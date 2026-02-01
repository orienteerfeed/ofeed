import { Badge, Checkbox } from '@/components/atoms';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { ChangelogEntry, tableRowTone } from './EventReportTable';

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
};

export const ReportTableRow = ({
  item,
  isProcessed,
  onToggleProcessed,
}: ReportTableRowProps) => {
  const { t } = useTranslation();
  const rowTone = tableRowTone(item, isProcessed);
  const typeLabel = t(`Pages.Event.Report.TypeLabels.${item.type}`, {
    defaultValue: item.type,
  });
  const originLabel = t(`Pages.Event.Report.OriginLabels.${item.origin}`, {
    defaultValue: item.origin ?? '-',
  });

  return (
    <TableRow className={rowTone}>
      <TableCell className="w-10">
        <Checkbox
          checked={isProcessed}
          onCheckedChange={value => onToggleProcessed(item.id, value === true)}
        />
      </TableCell>
      <TableCell>{item.id}</TableCell>
      <TableCell>
        {new Date(item.createdAt).toLocaleString('cs-CZ')}
      </TableCell>
      <TableCell>
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
      </TableCell>
      <TableCell>{item.competitorId}</TableCell>
      <TableCell>{item.competitor?.lastname ?? '-'}</TableCell>
      <TableCell>{item.competitor?.firstname ?? '-'}</TableCell>
      <TableCell>{item.previousValue ?? '-'}</TableCell>
      <TableCell>{item.newValue ?? '-'}</TableCell>
      <TableCell>{originLabel}</TableCell>
    </TableRow>
  );
};
