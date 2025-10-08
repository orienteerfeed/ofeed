import { cn } from '@/lib/utils';
import { XCircle } from 'lucide-react';
import * as React from 'react';

export type TableFetchErrorProps = {
  /** Can be an Error, string, or a React node */
  error: unknown;
  /** Optional extra classes for the wrapper */
  className?: string;
};

export function TableFetchError({ error, className }: TableFetchErrorProps) {
  const content = React.useMemo<React.ReactNode>(() => {
    if (React.isValidElement(error)) return error;
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }, [error]);

  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 py-2', className)}
      role="alert"
    >
      <XCircle className="mr-2 h-4 w-4" aria-hidden />
      {content}
    </span>
  );
}
