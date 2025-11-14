import { AlertDescription as ShadAlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import * as React from 'react';

export type AlertDescriptionProps = React.ComponentPropsWithoutRef<
  typeof ShadAlertDescription
>;

export const AlertDescription = React.forwardRef<
  React.ElementRef<typeof ShadAlertDescription>,
  AlertDescriptionProps
>(({ className, ...props }, ref) => (
  <ShadAlertDescription
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)} // keep shadcn default + extend
    {...props}
  />
));

AlertDescription.displayName = 'AlertDescription';
