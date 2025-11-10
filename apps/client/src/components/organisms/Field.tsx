import { useField } from '@tanstack/react-form';
import React from 'react';
import { InputWithHelper } from '../molecules/InputWithHelper';

export type FieldProps = {
  name: string;
  validate?: (value: any) => string | undefined;
  form?: any;
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

export const Field = (props: FieldProps): React.JSX.Element => {
  const { name, validate, type = 'text', form, ...inputProps } = props;
  const [localError, setLocalError] = React.useState<string | undefined>();
  const validationTimeoutRef = React.useRef<number | null>(null);

  // Use the field without explicit typing UseFieldOptions
  const field = useField({
    name: name as any,
    form: form,
    validators: {
      onBlur: validate ? ({ value }) => validate(value) : undefined,
    },
  });

  const handleLocalValidation = (value: string) => {
    if (!validate) return;

    // Clear previous timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Debounce validation - spustí se po 500ms od poslední změny
    validationTimeoutRef.current = setTimeout(() => {
      const error = validate(value);
      setLocalError(error);
    }, 500);
  };

  const handleBlur = (): void => {
    // Validate immediately when leaving the field
    if (validate) {
      const error = validate(field.state.value as string);
      setLocalError(error);
    }
    field.handleBlur();
  };

  // Handle different input types
  const handleValueChange = (value: string): void => {
    field.handleChange(value);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    field.handleChange(value);
    handleLocalValidation(value);
  };

  const handleCheckboxChange = (checked: boolean | 'indeterminate'): void => {
    const value = checked === true;
    field.handleChange(value);
    if (validate) {
      const error = validate(value);
      setLocalError(error);
    }
  };

  const displayError =
    localError ||
    (field.state.meta.errors.length > 0
      ? field.state.meta.errors.join(', ')
      : undefined);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // Reset local error when field is reset
  React.useEffect(() => {
    if (!field.state.value) {
      setLocalError(undefined);
    }
  }, [field.state.value]);

  // Render based on type
  if (type === 'select') {
    return (
      <InputWithHelper
        type="select"
        name={name}
        value={(field.state.value as string) ?? ''}
        onValueChange={handleValueChange}
        onBlur={handleBlur}
        error={displayError}
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
        onBlur={handleBlur}
        error={displayError}
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
      onBlur={handleBlur}
      error={displayError}
      {...(inputProps as any)}
    />
  );
};
