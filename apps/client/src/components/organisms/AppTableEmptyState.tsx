import { TableFetchError, TableNoDataAvailable } from '@/components/atoms';
import { useTranslation } from 'react-i18next';
import { AppTableLoadingData } from './AppTableLoadingData';

export type AppTableEmptyStateProps = {
  isLoading: boolean;
  error?: string | Error | null | undefined;
};

export const AppTableEmptyState = ({
  isLoading,
  error,
}: AppTableEmptyStateProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return <AppTableLoadingData />;
  }

  if (error) {
    const normalized = error instanceof Error ? error.message : error;
    return (
      <TableFetchError
        error={normalized ?? t('Organisms.AppDataTable.Error', 'Error')}
      />
    );
  }

  return <TableNoDataAvailable />;
};
