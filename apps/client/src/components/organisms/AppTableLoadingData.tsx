import { TableLoadingProgress } from '@/components/atoms';
import { useTranslation } from 'react-i18next';

export type AppTableLoadingDataProps = {
  label?: string;
};

export const AppTableLoadingData = ({ label }: AppTableLoadingDataProps) => {
  const { t } = useTranslation();
  return (
    <TableLoadingProgress
      label={
        label ?? t('Organisms.AppDataTable.Loading', 'Načítání dat...')
      }
    />
  );
};
