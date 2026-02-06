import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { KeyboardEvent, ReactNode } from 'react';

export type AppTableRowProps = {
  rowClassName?: string;
  leadingCell?: ReactNode;
  leadingCellClassName?: string;
  columnOrder: string[];
  cellByColumn: Record<string, ReactNode>;
  onRowClick?: (() => void) | undefined;
};

export const AppTableRow = ({
  rowClassName,
  leadingCell,
  leadingCellClassName,
  columnOrder,
  cellByColumn,
  onRowClick,
}: AppTableRowProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (!onRowClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick();
    }
  };

  return (
    <TableRow
      className={cn(
        rowClassName,
        onRowClick ? 'cursor-pointer hover:bg-muted/50' : undefined
      )}
      onClick={onRowClick}
      onKeyDown={handleKeyDown}
      role={onRowClick ? 'button' : undefined}
      tabIndex={onRowClick ? 0 : undefined}
    >
      {leadingCell && (
        <TableCell className={cn('w-10', leadingCellClassName)}>
          {leadingCell}
        </TableCell>
      )}
      {columnOrder.map(column => (
        <TableCell key={column}>{cellByColumn[column]}</TableCell>
      ))}
    </TableRow>
  );
};
