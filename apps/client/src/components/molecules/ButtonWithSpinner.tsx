import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { FC } from 'react';
import { Button, type ButtonProps } from '../atoms';

export interface ButtonWithSpinnerProps extends ButtonProps {
  /** Shows loading spinner and disables the button */
  isSubmitting?: boolean | undefined;
  /** Spinner position (default: 'left') */
  spinnerPosition?: 'left' | 'right' | undefined;
}

export const ButtonWithSpinner: FC<ButtonWithSpinnerProps> = ({
  children,
  isSubmitting = false,
  spinnerPosition = 'left',
  className,
  disabled,
  ...props
}) => {
  const isDisabled = isSubmitting || disabled;

  return (
    <Button
      {...props}
      disabled={isDisabled}
      className={cn(
        'inline-flex items-center justify-center',
        isDisabled && '!cursor-not-allowed opacity-50',
        className
      )}
    >
      {isSubmitting && spinnerPosition === 'left' && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin flex-shrink-0" />
      )}
      {children}
      {isSubmitting && spinnerPosition === 'right' && (
        <Loader2 className="ml-2 h-4 w-4 animate-spin flex-shrink-0" />
      )}
    </Button>
  );
};
