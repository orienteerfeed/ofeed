import { Switch as ShadSwitch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import * as React from 'react';

export type ToggleSwitchProps = Omit<
  React.ComponentPropsWithoutRef<typeof ShadSwitch>,
  'checked' | 'onCheckedChange'
> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const ToggleSwitch = React.forwardRef<
  React.ElementRef<typeof ShadSwitch>,
  ToggleSwitchProps
>(({ className, checked, onCheckedChange, ...props }, ref) => {
  return (
    <ShadSwitch
      ref={ref}
      className={cn(className)} // nechává výchozí shadcn styly
      {...(checked !== undefined ? { checked } : {})}
      {...(onCheckedChange ? { onCheckedChange } : {})}
      {...props}
    />
  );
});

ToggleSwitch.displayName = 'ToggleSwitch';
