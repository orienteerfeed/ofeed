import {
  Badge as ShadcnBadge,
  type BadgeProps as ShadcnBadgeProps,
} from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { forwardRef, useMemo } from 'react';

export interface BadgeProps extends Omit<ShadcnBadgeProps, 'ref'> {
  /** icon before text */
  icon?: React.ReactNode;
  /** icon after text */
  trailingIcon?: React.ReactNode;
  /** icon position */
  iconPosition?: 'left' | 'right';
  /** loading status */
  isLoading?: boolean;
  /** number for badge with number */
  count?: number;
  /** maximum number displayed */
  maxCount?: number;
  /** dot indicator instead of number */
  dot?: boolean;
}

/**
 * Badge atom component - wrapper around shadcn/ui Badge
 * Preserves all default styles and adds useful features
 */
export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      className,
      icon,
      trailingIcon,
      iconPosition = 'left',
      isLoading = false,
      count,
      maxCount = 99,
      dot = false,
      children,
      ...props
    },
    ref
  ) => {
    // Processing count for badge with number
    const displayCount = useMemo(() => {
      if (dot) return null;
      if (count === undefined || count === null) return null;
      if (count === 0) return null;
      return count > maxCount ? `${maxCount}+` : count.toString();
    }, [count, maxCount, dot]);

    // Loading status
    if (isLoading) {
      return (
        <ShadcnBadge
          // @ts-expect-error - ref is valid but types don't match
          ref={ref}
          className={cn('animate-pulse bg-muted text-transparent', className)}
          {...props}
        >
          {children || 'Loading'}
        </ShadcnBadge>
      );
    }

    return (
      <ShadcnBadge
        // @ts-expect-error - ref is valid but types don't match
        ref={ref}
        className={cn('inline-flex items-center gap-1', className)}
        {...props}
      >
        {/* Dot indicator */}
        {dot && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-current"
            aria-hidden="true"
          />
        )}

        {/* Count badge */}
        {displayCount && !dot && (
          <span className="flex-shrink-0">{displayCount}</span>
        )}

        {/* Left icon */}
        {icon && iconPosition === 'left' && (
          <span className="flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}

        {/* Text content */}
        {children && !dot && (
          <span className={cn(displayCount && 'ml-1')}>{children}</span>
        )}

        {/* Trailing icon */}
        {(trailingIcon || (icon && iconPosition === 'right')) && (
          <span className="flex-shrink-0" aria-hidden="true">
            {trailingIcon || icon}
          </span>
        )}
      </ShadcnBadge>
    );
  }
);

Badge.displayName = 'Badge';

// Re-export of the original shadcn badge and its types
export { ShadcnBadge };
export type { ShadcnBadgeProps };
