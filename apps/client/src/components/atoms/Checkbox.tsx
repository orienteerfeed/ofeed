import { Checkbox as ShadCheckbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as React from 'react';

type CheckedState = boolean | 'indeterminate';

type HelpersProp = {
  /** Optional bridge (e.g., to Formik/RHF). */
  helpers?: {
    setValue?: (v: boolean) => void;
  };
};

export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof ShadCheckbox>,
  'checked' | 'onCheckedChange'
> &
  HelpersProp & {
    /** Controlled checked state; if omitted, prop is not passed. */
    checked?: CheckedState;
    /** Optional change handler (same shape as Radix). */
    onCheckedChange?: (value: CheckedState) => void;
  };

/**
 * Checkbox atom:
 * - Uses shadcn/ui Checkbox (keeps default styles).
 * - Optional `helpers.setValue` gets a boolean.
 * - Forwards ref to Radix Root element.
 */
export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, checked, helpers, onCheckedChange, ...props }, ref) => {
  const handleChange = (value: CheckedState) => {
    // Bridge: normalize to boolean for external form helpers
    helpers?.setValue?.(value === true);
    onCheckedChange?.(value);
  };

  return (
    <ShadCheckbox
      ref={ref}
      className={cn(className)} // don’t override shadcn defaults
      {...(checked !== undefined ? { checked } : {})} // avoid passing undefined
      onCheckedChange={handleChange}
      {...props}
    />
  );
});
Checkbox.displayName = 'Checkbox';
