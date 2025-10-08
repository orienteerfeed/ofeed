import { useField } from '@tanstack/react-form';
import React from 'react';
import { InputWithHelper } from '../molecules/InputWithHelper';

// Simplified approach - define props more directly
export type FieldProps = {
  name: string;
  validate?: (value: any) => string | undefined;
} & (
  | {
      type: 'select';
      [key: string]: any;
    }
  | {
      type: 'checkbox';
      [key: string]: any;
    }
  | {
      type?: React.InputHTMLAttributes<HTMLInputElement>['type'];
      [key: string]: any;
    }
);

export function Field(props: FieldProps): React.JSX.Element {
  const { name, validate, type = 'text', ...inputProps } = props;

  const field = useField({
    name,
    validators: {
      onChange: validate
        ? ({ value }: { value: any }) => validate(value)
        : undefined,
      onBlur: validate
        ? ({ value }: { value: any }) => validate(value)
        : undefined,
    },
  } as any);

  const error: string | undefined =
    field.state.meta.errors.length > 0
      ? field.state.meta.errors.join(', ')
      : undefined;

  // Handle different input types
  const handleValueChange = (value: string): void => {
    field.handleChange(value);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    field.handleChange(e.target.value);
  };

  const handleCheckboxChange = (checked: boolean | 'indeterminate'): void => {
    field.handleChange(checked === true);
  };

  // Render based on type
  if (type === 'select') {
    return (
      <InputWithHelper
        type="select"
        name={name}
        value={(field.state.value as string) ?? ''}
        onValueChange={handleValueChange}
        onBlur={field.handleBlur}
        error={error}
        {...(inputProps as any)}
      />
    );
  }

  if (type === 'checkbox') {
    return (
      <InputWithHelper
        type="checkbox"
        name={name}
        checked={Boolean(field.state.value)}
        onCheckedChange={handleCheckboxChange}
        onBlur={field.handleBlur}
        error={error}
        {...(inputProps as any)}
      />
    );
  }

  // Regular input types
  return (
    <InputWithHelper
      type={type}
      name={name}
      value={(field.state.value as string) ?? ''}
      onChange={handleInputChange}
      onBlur={field.handleBlur}
      error={error}
      {...(inputProps as any)}
    />
  );
}
