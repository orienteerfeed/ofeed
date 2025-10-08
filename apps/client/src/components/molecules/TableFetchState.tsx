import * as React from 'react';
import {
  TableFetchError,
  TableLoadingProgress,
  TableNoDataAvailable,
} from '../atoms';

export type TableFetchStateProps = {
  isLoading?: boolean;
  error?: string | Error | React.ReactNode;
};

export function TableFetchState({ isLoading, error }: TableFetchStateProps) {
  if (isLoading) return <TableLoadingProgress />;

  if (error) {
    const normalized: React.ReactNode =
      error instanceof Error ? error.message : error;
    return <TableFetchError error={normalized} />;
  }

  return <TableNoDataAvailable />;
}

export default TableFetchState;
