import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

type LoadingDotsProps = {
  className?: string;
  dotClassName?: string;
};

const DOT_DELAYS = ['0ms', '150ms', '300ms'] as const;

export function LoadingDots({ className, dotClassName }: LoadingDotsProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-hidden="true"
    >
      {DOT_DELAYS.map(delay => (
        <span
          key={delay}
          className={cn(
            'h-2 w-2 rounded-full bg-primary animate-bounce motion-reduce:animate-none',
            dotClassName
          )}
          style={{ animationDelay: delay } as CSSProperties}
        />
      ))}
    </span>
  );
}
