import { cn } from '@/lib/utils'; // or remove and use template strings if you don't have this helper
import { Loader2 } from 'lucide-react';

export type TableLoadingProgressProps = {
  /** Override the default loading message */
  label?: string;
  /** Extra classes for the wrapper */
  className?: string;
};

export const TableLoadingProgress = ({
  label = 'Loading data…',
  className,
}: TableLoadingProgressProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center self-center gap-1 px-2 py-2 text-center',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
};
