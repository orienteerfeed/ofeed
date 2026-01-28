import { Select } from '@/components/atoms';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type ReportRowsPerPageProps = {
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
};

export const ReportRowsPerPage = ({
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 200],
}: ReportRowsPerPageProps) => {
  const { t } = useTranslation();
  const options = useMemo(
    () =>
      pageSizeOptions.map(value => ({
        value: value.toString(),
        label: t('Pages.Event.Report.Pagination.RowsOption', { count: value }),
      })),
    [pageSizeOptions, t]
  );

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>{t('Pages.Event.Report.Pagination.RowsPerPage')}</span>
      <Select
        value={pageSize.toString()}
        onValueChange={value => onPageSizeChange(Number(value))}
        options={options}
        className="h-8 w-[110px]"
      />
    </div>
  );
};
