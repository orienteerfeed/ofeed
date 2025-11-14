import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import React, { forwardRef } from 'react';

import { cn } from '@/lib/utils';
import { AlertDescription, AlertTitle } from '../molecules';

const alertVariants = cva(
  'relative w-full rounded-lg p-4 flex items-start gap-2 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-3px] [&:has(svg)]:pl-12',
  {
    variants: {
      variant: {
        default: 'text-foreground dark:text-white',
        filled: 'text-white',
        outlined: 'border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

// Define colors for each severity type
const severityColors = {
  success: {
    filled: 'bg-green-200 text-green-900 dark:bg-green-700 dark:text-white',
    outlined: 'border-green-500 text-green-700 dark:text-green-300',
    icon: {
      filled: 'text-green-900 dark:text-white',
      outlined: 'text-green-700 dark:text-green-300',
      default: 'text-green-700 dark:text-white',
    },
  },
  info: {
    filled: 'bg-blue-200 text-blue-900 dark:bg-blue-700 dark:text-white',
    outlined: 'border-blue-500 text-blue-700 dark:text-blue-300',
    icon: {
      filled: 'text-blue-900 dark:text-white',
      outlined: 'text-blue-700 dark:text-blue-300',
      default: 'text-blue-700 dark:text-white',
    },
  },
  warning: {
    filled: 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-white',
    outlined: 'border-orange-500 text-orange-700 dark:text-orange-300',
    icon: {
      filled: 'text-orange-900 dark:text-white',
      outlined: 'text-orange-700 dark:text-orange-300',
      default: 'text-orange-700 dark:text-white',
    },
  },
  error: {
    filled: 'bg-red-200 text-red-900 dark:bg-red-700 dark:text-white',
    outlined: 'border-red-500 text-red-700 dark:text-red-300',
    icon: {
      filled: 'text-red-900 dark:text-white',
      outlined: 'text-red-700 dark:text-red-300',
      default: 'text-red-700 dark:text-white',
    },
  },
} as const;

// Define types for severity and variant
type SeverityType = 'success' | 'info' | 'warning' | 'error';
type AlertVariant = 'default' | 'filled' | 'outlined';

interface SeverityIconProps {
  severity: SeverityType;
  variant?: AlertVariant;
  size?: number | string;
}

const SeverityIcon = ({
  severity,
  variant = 'default',
  size = 24,
}: SeverityIconProps) => {
  const iconColorClass =
    severityColors[severity]?.icon?.[variant] ||
    severityColors[severity]?.icon?.default;

  const iconProps = {
    size,
    className: cn(iconColorClass),
  };

  switch (severity) {
    case 'success':
      return <CheckCircle2 {...iconProps} />;
    case 'warning':
      return <AlertTriangle {...iconProps} />;
    case 'error':
      return <AlertCircle {...iconProps} />;
    case 'info':
      return <Info {...iconProps} />;
    default:
      return null;
  }
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
  severity?: SeverityType;
}

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  (
    {
      title,
      severity = 'info',
      children,
      className,
      variant, // Remove default value here since it comes from VariantProps
      ...props
    },
    ref
  ) => {
    // Resolve the variant, handling the potential null case
    const resolvedVariant: AlertVariant = variant || 'default';

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          alertVariants({ variant: resolvedVariant }),
          resolvedVariant !== 'default' &&
            severityColors[severity]?.[
              resolvedVariant as 'filled' | 'outlined'
            ],
          className
        )}
        {...props}
      >
        <SeverityIcon severity={severity} variant={resolvedVariant} size={24} />
        <div className="flex-1">
          {title && <AlertTitle>{title}</AlertTitle>}
          {children && <AlertDescription>{children}</AlertDescription>}
        </div>
      </div>
    );
  }
);

Alert.displayName = 'Alert';

export { Alert };
