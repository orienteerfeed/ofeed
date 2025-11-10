import { cn } from '@/lib/utils';
import * as React from 'react';

// Optional language → country fallback map (extend as needed)
const LOCALE_TO_COUNTRY: Record<string, string> = {
  en: 'gb',
  cs: 'cz',
  sk: 'sk',
  de: 'de',
  fr: 'fr',
  es: 'es',
  it: 'it',
  pl: 'pl',
  ru: 'ru',
  ja: 'jp',
  ko: 'kr',
  zh: 'cn',
};

export type FlagIconProps = Omit<
  React.ComponentPropsWithoutRef<'span'>,
  'children'
> & {
  /** ISO 3166-1 alpha-2 code (e.g., 'cz', 'de', 'us'). 'en' maps to 'gb'. */
  countryCode?: string;
  /** Whether to use the squared variant from flag-icons. */
  squared?: boolean;
  /** Size of the flag icon */
  size?: 'sm' | 'md' | 'lg';
};

/**
 * FlagIcon — wrapper around the `flag-icons` package.
 * Usage: renders a <span> with classes like `fi fi-us` and optionally `fis`.
 * Accessibility: pass `aria-label` for a spoken name; omit it for decorative use.
 */
export const FlagIcon = React.forwardRef<HTMLSpanElement, FlagIconProps>(
  (
    {
      countryCode,
      squared = true,
      size = 'md',
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

    // Size classes
    const sizeClasses = {
      sm: 'w-4 h-3 text-xs',
      md: 'w-6 h-4 text-sm',
      lg: 'w-8 h-6 text-base',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'fi inline-block bg-cover bg-no-repeat rounded border border-border',
          squared && 'fis',
          isValid && `fi-${code}`,
          sizeClasses[size],
          !isValid && 'bg-muted', // Fallback background when no valid country code
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
