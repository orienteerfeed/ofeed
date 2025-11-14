import { Input as ShadInput } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import * as React from 'react';

export type InputProps = React.ComponentPropsWithoutRef<typeof ShadInput>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return <ShadInput ref={ref} className={cn(className)} {...props} />;
  }
);

Input.displayName = 'Input';
