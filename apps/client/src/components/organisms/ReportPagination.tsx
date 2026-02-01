import { Button } from '@/components/atoms';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ReportPaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
};

export const ReportPagination = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: ReportPaginationProps) => {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const canGoBack = page > 1;
  const canGoNext = page < totalPages;

  const pages = buildPagination(page, totalPages);

  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onPageChange(page - 1)}
        disabled={!canGoBack}
        aria-label={t('Pages.Event.Report.Pagination.Previous')}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-1">
        {pages.map((item, index) =>
          item === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="px-1 text-muted-foreground"
            >
              …
            </span>
          ) : (
            <Button
              key={item}
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onPageChange(item)}
              className={item === page ? 'bg-accent text-accent-foreground' : ''}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </Button>
          )
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => onPageChange(page + 1)}
        disabled={!canGoNext}
        aria-label={t('Pages.Event.Report.Pagination.Next')}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

const buildPagination = (current: number, total: number) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages: Array<number | 'ellipsis'> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push('ellipsis');
  for (let i = left; i <= right; i += 1) {
    pages.push(i);
  }
  if (right < total - 1) pages.push('ellipsis');
  pages.push(total);

  return pages;
};
