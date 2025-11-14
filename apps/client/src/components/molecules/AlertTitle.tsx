import { AlertTitle as ShadAlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import * as React from 'react';

/** Title (H5) */
export type AlertTitleProps = React.ComponentPropsWithoutRef<
  typeof ShadAlertTitle
>;

export const AlertTitle = React.forwardRef<
  React.ElementRef<typeof ShadAlertTitle>,
  AlertTitleProps
>(({ className, ...props }, ref) => (
  <ShadAlertTitle
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';
