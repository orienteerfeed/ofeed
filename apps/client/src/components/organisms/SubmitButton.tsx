import { useForm } from '@tanstack/react-form';
import React from 'react';
import { ButtonWithSpinner, ButtonWithSpinnerProps } from '../molecules';

interface SubmitButtonProps
  extends Omit<ButtonWithSpinnerProps, 'type' | 'disabled' | 'isSubmitting'> {
  children: React.ReactNode;
}

export const SubmitButton: React.FC<SubmitButtonProps> = ({
  children,
  ...props
}) => {
  const form = useForm();

  // Přímo přistupujeme ke stavu formuláře
  const { isSubmitting, isValid, isDirty } = form.state;

  return (
    <ButtonWithSpinner
      type="submit"
      disabled={isSubmitting || !(isValid && isDirty)}
      isSubmitting={isSubmitting}
      {...props}
    >
      {children}
    </ButtonWithSpinner>
  );
};
SubmitButton.displayName = 'SubmitButton';
