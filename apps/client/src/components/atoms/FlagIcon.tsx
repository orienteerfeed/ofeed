import { cn } from '@/lib/utils';
import * as React from 'react';

// Optional language → country fallback map (extend as needed)
const LOCALE_TO_COUNTRY: Record<string, string> = {
  en: 'gb',
};

export type FlagIconProps = Omit<
  React.ComponentPropsWithoutRef<'span'>,
  'children'
> & {
  /** ISO 3166-1 alpha-2 code (e.g., 'cz', 'de', 'us'). 'en' maps to 'gb'. */
  countryCode?: string;
  /** Whether to use the squared variant from flag-icons (`.fis`). */
  squared?: boolean;
};

/**
 * FlagIcon — lightweight wrapper around the `flag-icons` classes.
 * Usage: renders a <span> with classes like `fi fi-us` and optionally `fis`.
 * Accessibility: pass `aria-label` for a spoken name; omit it for decorative use.
 */
export const FlagIcon = React.forwardRef<HTMLSpanElement, FlagIconProps>(
  (
    {
      countryCode,
      squared = true,
      className,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    // Normalize and map locale-to-country if applicable
    const raw = (countryCode ?? '').trim().toLowerCase();
    const code = LOCALE_TO_COUNTRY[raw] ?? raw;

    // Basic guard to avoid invalid class names
    const isValid = /^[a-z]{2}$/.test(code);

    return (
      <span
        ref={ref}
        className={cn(
          'fi inline-block',
          squared && 'fis',
          isValid && `fi-${code}`,
          className
        )}
        // If no aria-label is provided, treat as decorative
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        {...props}
      />
    );
  }
);

FlagIcon.displayName = 'FlagIcon';
