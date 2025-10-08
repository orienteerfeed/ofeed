import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Select as ShadSelect,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import * as React from 'react';

export type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type SelectProps = Omit<
  React.ComponentPropsWithoutRef<typeof ShadSelect>,
  'children' | 'value' | 'onValueChange' | 'defaultValue'
> & {
  value?: string;
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
};

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      onValueChange,
      options = [],
      placeholder = '',
      className,
      contentClassName,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <ShadSelect
        {...props}
        {...(value !== undefined ? { value } : {})}
        {...(onValueChange ? { onValueChange } : {})}
        {...(disabled !== undefined ? { disabled } : {})}
      >
        <SelectTrigger
          ref={ref}
          className={cn(className)}
          {...(disabled !== undefined ? { disabled } : {})}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent className={cn(contentClassName)}>
          {options.map(opt => (
            <SelectItem
              key={opt.value}
              value={opt.value}
              {...(opt.disabled !== undefined
                ? { disabled: opt.disabled }
                : {})}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </ShadSelect>
    );
  }
);

Select.displayName = 'Select';

export default Select;
