import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react';
import type { DragEvent, ReactNode } from 'react';
import { useMemo, useRef } from 'react';

export type AppTableColumn<K extends string = string> = {
  id: K;
  label: ReactNode;
  sortable?: boolean;
  filter?: ReactNode;
  className?: string;
  headerClassName?: string;
};

export type AppTableHeaderProps<K extends string = string> = {
  columns: AppTableColumn<K>[];
  columnOrder: K[];
  onColumnOrderChange?: ((next: K[]) => void) | undefined;
  sortConfig?: { column: K; direction: 'asc' | 'desc' };
  onSort?: (column: K) => void;
  leadingCell?: ReactNode;
  leadingCellClassName?: string;
  dragHandleLabel?: string;
  headerClassName?: string;
};

export const AppTableHeader = <K extends string = string>({
  columns,
  columnOrder,
  onColumnOrderChange,
  sortConfig,
  onSort,
  leadingCell,
  leadingCellClassName,
  dragHandleLabel = 'Drag column',
  headerClassName,
}: AppTableHeaderProps<K>) => {
  const dragSourceRef = useRef<K | null>(null);
  const canReorder = Boolean(onColumnOrderChange);

  const columnMap = useMemo(() => {
    return new Map(columns.map(column => [column.id, column]));
  }, [columns]);

  const orderedColumns = useMemo(() => {
    const ordered = columnOrder
      .map(key => columnMap.get(key))
      .filter(Boolean) as AppTableColumn<K>[];
    const unordered = columns.filter(col => !columnOrder.includes(col.id));
    return [...ordered, ...unordered];
  }, [columnMap, columnOrder, columns]);

  const moveColumn = (source: K, target: K) => {
    if (!onColumnOrderChange || source === target) return;
    const next = [...columnOrder];
    const fromIndex = next.indexOf(source);
    const toIndex = next.indexOf(target);
    if (fromIndex === -1 || toIndex === -1) return;
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, source);
    onColumnOrderChange(next);
  };

  const handleDragStart =
    (column: K) => (event: DragEvent<HTMLButtonElement>) => {
      dragSourceRef.current = column;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(column));
    };

  const handleDragOver = (event: DragEvent<HTMLTableCellElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop =
    (target: K) => (event: DragEvent<HTMLTableCellElement>) => {
      event.preventDefault();
      const source =
        dragSourceRef.current ??
        (event.dataTransfer.getData('text/plain') as K);
      if (!source) return;
      moveColumn(source, target);
      dragSourceRef.current = null;
    };

  const handleDragEnd = () => {
    dragSourceRef.current = null;
  };

  return (
    <TableHeader className={cn('bg-muted/40', headerClassName)}>
      <TableRow>
        {leadingCell && (
          <TableHead className={cn('w-10', leadingCellClassName)}>
            {leadingCell}
          </TableHead>
        )}
        {orderedColumns.map(column => {
          const isActive = sortConfig?.column === column.id;
          const icon = !isActive ? (
            <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
          ) : sortConfig?.direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          );

          return (
            <TableHead
              key={column.id}
              className={cn('align-top py-3', column.headerClassName)}
              onDragOver={canReorder ? handleDragOver : undefined}
              onDrop={canReorder ? handleDrop(column.id) : undefined}
            >
              <div className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-muted-foreground">
                <div className="flex items-center gap-2">
                  {canReorder && (
                    <button
                      type="button"
                      draggable
                      onDragStart={handleDragStart(column.id)}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab text-muted-foreground hover:text-foreground"
                      aria-label={dragHandleLabel}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {column.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.id)}
                      className="flex items-center gap-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <span>{column.label}</span>
                      {icon}
                    </button>
                  ) : (
                    <span>{column.label}</span>
                  )}
                </div>
              </div>
              {column.filter}
            </TableHead>
          );
        })}
      </TableRow>
    </TableHeader>
  );
};
