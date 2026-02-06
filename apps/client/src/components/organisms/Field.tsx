import {
  type DeepValue,
  type ReactFormExtendedApi,
  useField,
} from '@tanstack/react-form';
import React from 'react';
import { type CheckboxProps, type InputProps, type SelectProps } from '../atoms';
import {
  InputWithHelper,
  type CommonProps,
  type InputWithHelperProps,
} from '../molecules/InputWithHelper';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyReactFormApi<TFormData = unknown> = ReactFormExtendedApi<
  TFormData,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type FieldProps<TFormData = unknown> = {
  name: string;
  validate?: (value: string) => string | undefined;
  form: AnyReactFormApi<TFormData>;
} & Omit<InputWithHelperProps, 'name' | 'form'>;

export const Field = <TFormData,>(
  props: FieldProps<TFormData>
): React.JSX.Element => {
  const { name, validate, type = 'text', form, ...inputProps } = props;
  const [localError, setLocalError] = React.useState<string | undefined>();
  const validationTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Use the field without explicit typing UseFieldOptions
  const field = useField({
    name,
    form,
    validators: {
      onBlur: validate ? ({ value }) => validate(String(value ?? '')) : undefined,
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
      const error = validate(String(field.state.value ?? ''));
      setLocalError(error);
    }
    field.handleBlur();
  };

  type FieldValue = DeepValue<TFormData, string>;
  const setFieldValue = (value: unknown) => {
    field.handleChange(() => value as FieldValue);
  };

  // Handle different input types
  const handleValueChange = (value: string): void => {
    setFieldValue(value);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setFieldValue(value);
    handleLocalValidation(value);
  };

  const handleCheckboxChange = (checked: boolean | 'indeterminate'): void => {
    const value = checked === true;
    setFieldValue(value);
    if (validate) {
      const error = validate(String(value));
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
    const selectProps = inputProps as Omit<
      SelectProps & CommonProps,
      'name' | 'type'
    >;
    return (
      <InputWithHelper
        type="select"
        name={name}
        value={(field.state.value as string) ?? ''}
        onValueChange={handleValueChange}
        onBlur={handleBlur}
        error={displayError}
        {...selectProps}
      />
    );
  }

  if (type === 'checkbox') {
    const checkboxProps = inputProps as Omit<
      CheckboxProps & CommonProps,
      'name' | 'type' | 'checked' | 'onCheckedChange'
    >;
    const checkboxFieldProps = {
      type: 'checkbox' as const,
      name,
      checked: Boolean(field.state.value),
      onCheckedChange: handleCheckboxChange,
      error: displayError,
      ...checkboxProps,
    } as unknown as InputWithHelperProps;
    return (
      <InputWithHelper {...checkboxFieldProps} />
    );
  }

  const inputPropsTyped = inputProps as Omit<
    InputProps & CommonProps,
    'name' | 'type'
  >;
  // Regular input types
  return (
    <InputWithHelper
      type={type}
      name={name}
      value={(field.state.value as string) ?? ''}
      onChange={handleInputChange}
      onBlur={handleBlur}
      error={displayError}
      {...inputPropsTyped}
    />
  );
};
