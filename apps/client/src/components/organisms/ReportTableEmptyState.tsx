import { TableFetchState } from '@/components/molecules';

export type ReportTableEmptyStateProps = {
  isLoading: boolean;
  error?: string | Error | null | undefined;
};

export const ReportTableEmptyState = ({
  isLoading,
  error,
}: ReportTableEmptyStateProps) => {
  return <TableFetchState isLoading={isLoading} error={error} />;
};
