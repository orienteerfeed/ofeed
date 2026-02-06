import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommonTranslationKeys } from '@/types/i18n';

interface TableNoDataAvailableProps {
  className?: string;
  messageKey?: CommonTranslationKeys;
}

export const TableNoDataAvailable: FC<TableNoDataAvailableProps> = ({
  className = '',
  messageKey = 'Table.NoData',
}) => {
  const { t } = useTranslation('common');

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-2 ${className}`}>
      {t(messageKey)}
    </span>
  );
};
