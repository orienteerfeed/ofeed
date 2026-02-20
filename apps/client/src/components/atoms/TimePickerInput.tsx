import { cn } from '@/lib/utils';
import * as React from 'react';
import { Input, type InputProps } from './Input';

export type TimePickerInputProps = Omit<InputProps, 'type'>;

export const TimePickerInput = React.forwardRef<
  HTMLInputElement,
  TimePickerInputProps
>(({ className, step = '1', ...props }, ref) => {
  return (
    <Input
      ref={ref}
      type="time"
      step={step}
      className={cn(
        'bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none',
        className
      )}
      {...props}
    />
  );
});

TimePickerInput.displayName = 'TimePickerInput';
