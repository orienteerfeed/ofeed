import { cn } from '@/lib/utils';
import * as React from 'react';
import { forwardRef } from 'react';
import {
  Checkbox,
  type CheckboxProps,
  Input,
  type InputProps,
  Select,
  type SelectProps,
  TimePickerInput,
} from '../atoms';

export interface CommonProps {
  /** Error text (shows in red and marks field aria-invalid) */
  error?: React.ReactNode;
  /** Helper text (shows when there is no error) */
  helperText?: React.ReactNode;
  /** Extra class appended to the rendered control */
  className?: string;
  /** Label for the input */
  label?: string;
  /** ID for the input (common across all types) */
  id?: string;
  /** Name for the input (common across all types) */
  name?: string;
  /** Allow mobile auto-capitalization */
  autoCapitalize?: string;
  /** Allow mobile auto-correct */
  autoCorrect?: string;
  /** Read-only state for inputs */
  readOnly?: boolean;
}

// Combined type for all possible props
export type InputWithHelperProps =
  | ({ type: 'select' } & SelectProps & CommonProps)
  | ({ type: 'checkbox' } & CheckboxProps & CommonProps)
  | ({
      type?: Exclude<
        React.InputHTMLAttributes<HTMLInputElement>['type'],
        'checkbox'
      >;
    } & InputProps &
      CommonProps);

// ForwardRef implementation
const InputWithHelperComponent = forwardRef<
  HTMLInputElement | HTMLButtonElement,
  InputWithHelperProps
>((props, ref) => {
  const {
    error,
    helperText,
    className,
    label,
    type = 'text',
    id,
    name,
  } = props;
  const hasError = Boolean(error);
  const fieldClass = cn(className, hasError && 'border-destructive');

  // Create clean props for each component type
  const getSelectProps = (props: InputWithHelperProps): SelectProps => {
    const {
      type,
      error,
      helperText,
      label,
      ...selectProps
    } = props;
    void type;
    void error;
    void helperText;
    void label;
    return selectProps as SelectProps;
  };

  const getCheckboxProps = (props: InputWithHelperProps): CheckboxProps => {
    const {
      type,
      error,
      helperText,
      label,
      ...checkboxProps
    } = props;
    void type;
    void error;
    void helperText;
    void label;
    return checkboxProps as CheckboxProps;
  };

  const getInputProps = (props: InputWithHelperProps): InputProps => {
    const {
      type,
      error,
      helperText,
      label,
      ...inputProps
    } = props;
    void type;
    void error;
    void helperText;
    void label;
    return inputProps as InputProps;
  };

  // Generate a safe ID for the checkbox
  const checkboxId = id || (name ? `checkbox-${name}` : undefined);

  return (
    <div className="space-y-1">
      {label && type !== 'checkbox' && (
        <label
          htmlFor={type !== 'select' ? id : undefined}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
      )}
      {type === 'select' ? (
        <Select
          {...getSelectProps(props)}
          ref={ref as React.Ref<HTMLButtonElement>}
          className={fieldClass}
          aria-invalid={hasError || undefined}
        />
      ) : type === 'checkbox' ? (
        <div className="flex items-center space-x-2">
          <Checkbox
            {...getCheckboxProps(props)}
            ref={ref as React.Ref<HTMLButtonElement>}
            className={fieldClass}
            aria-invalid={hasError || undefined}
            id={checkboxId}
          />
          {label && (
            <label
              htmlFor={checkboxId}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {label}
            </label>
          )}
        </div>
      ) : type === 'time' ? (
        <TimePickerInput
          {...getInputProps(props)}
          ref={ref as React.Ref<HTMLInputElement>}
          className={fieldClass}
          aria-invalid={hasError || undefined}
          id={id}
        />
      ) : (
        <Input
          {...getInputProps(props)}
          type={type}
          ref={ref as React.Ref<HTMLInputElement>}
          className={fieldClass}
          aria-invalid={hasError || undefined}
          id={id}
        />
      )}

      {!hasError && helperText ? (
        <p className="px-1 pt-1 text-left text-xs text-muted-foreground">
          {helperText}
        </p>
      ) : null}

      {hasError ? (
        <p className="px-1 pt-1 text-left text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
});

InputWithHelperComponent.displayName = 'InputWithHelper';

export const InputWithHelper = InputWithHelperComponent;
