import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export type AppDataTableProps<T, K extends string = string> = {
  data: T[];
  isLoading: boolean;
  error?: Error | string | null | undefined;
  columnCount: number;
  renderHeader: ReactNode;
  renderRow: (item: T) => ReactNode;
  emptyState?: ReactNode;
  emptyStateText?: string;
  loadingText?: string;
  errorText?: string;
  columnOrder?: K[];
  onColumnOrderChange?: (next: K[]) => void;
  columnOrderStorageKey?: string;
  renderToolbar?: ReactNode;
  renderPagination?: ReactNode;
};

export const AppDataTable = <T, K extends string = string>({
  data,
  isLoading,
  error,
  columnCount,
  renderHeader,
  renderRow,
  emptyState,
  emptyStateText,
  loadingText,
  errorText,
  columnOrder,
  onColumnOrderChange,
  columnOrderStorageKey,
  renderToolbar,
  renderPagination,
}: AppDataTableProps<T, K>) => {
  const { t } = useTranslation();
  const isEmpty = data.length === 0;
  const showEmptyState = isLoading || !!error || isEmpty;
  const resolvedEmptyText =
    emptyStateText ??
    t('Organisms.AppDataTable.Empty', 'Tabulka neobsahuje žádná data.');
  const resolvedLoadingText =
    loadingText ?? t('Organisms.AppDataTable.Loading', 'Načítání dat...');
  const resolvedErrorText =
    errorText ??
    t('Organisms.AppDataTable.Error', 'Nepodařilo se načíst data.');
  const resolvedEmptyState =
    emptyState ??
    (isLoading ? (
      <div className="text-sm text-muted-foreground">
        {resolvedLoadingText}
      </div>
    ) : error ? (
      <div className="text-sm text-destructive">{resolvedErrorText}</div>
    ) : (
      <div className="text-sm text-muted-foreground">{resolvedEmptyText}</div>
    ));

  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (!columnOrderStorageKey || !columnOrder || !onColumnOrderChange) return;
    if (hasHydratedRef.current) return;

    const stored = localStorage.getItem(columnOrderStorageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const allowed = new Set(columnOrder);
          const next = parsed.filter(
            (key: unknown): key is K =>
              typeof key === 'string' && allowed.has(key as K)
          );
          if (next.length === columnOrder.length) {
            onColumnOrderChange(next);
          }
        }
      } catch {
        // ignore malformed storage
      }
    }

    hasHydratedRef.current = true;
  }, [columnOrderStorageKey, columnOrder, onColumnOrderChange]);

  useEffect(() => {
    if (!columnOrderStorageKey || !columnOrder) return;
    if (!hasHydratedRef.current) return;
    localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder));
  }, [columnOrderStorageKey, columnOrder]);

  return (
    <div className="space-y-3">
      {renderToolbar && (
        <div className="flex items-center justify-end gap-2 sm:justify-between">
          <div className="flex-1">{renderToolbar}</div>
        </div>
      )}
      <div className="rounded-lg border bg-card">
        <Table>
          {renderHeader}
          <TableBody>
            {showEmptyState ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="py-8">
                  <div className="flex items-center justify-center">
                    {resolvedEmptyState}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map(item => renderRow(item))
            )}
          </TableBody>
        </Table>
      </div>
      {renderPagination}
    </div>
  );
};
