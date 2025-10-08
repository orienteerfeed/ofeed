import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { FC } from 'react';
import { Button, type ButtonProps } from '../atoms';

export interface ButtonWithSpinnerProps extends ButtonProps {
  /** Zobrazí loading spinner a disablene tlačítko */
  isSubmitting?: boolean;
  /** Pozice spinneru (default: 'left') */
  spinnerPosition?: 'left' | 'right';
}

export const ButtonWithSpinner: FC<ButtonWithSpinnerProps> = ({
  children,
  isSubmitting = false,
  spinnerPosition = 'left',
  className,
  disabled,
  ...props
}) => {
  return (
    <Button
      {...props}
      disabled={isSubmitting || disabled}
      className={cn(
        'inline-flex items-center justify-center',
        isSubmitting && 'cursor-wait',
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
