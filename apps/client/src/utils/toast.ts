import type { ExternalToast } from 'sonner';
import { toast as sonnerToast } from 'sonner';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

interface ToastProps extends Omit<ExternalToast, 'type'> {
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

export function toast({
  title,
  description,
  variant = 'default',
  ...props
}: ToastProps) {
  const toastOptions: ExternalToast = {
    ...props,
  };

  if (description) {
    toastOptions.description = description;
  }

  switch (variant) {
    case 'success':
      return sonnerToast.success(title, toastOptions);
    case 'error': // Používáme 'error' místo 'destructive'
      return sonnerToast.error(title, toastOptions);
    case 'warning':
      return sonnerToast.warning(title, toastOptions);
    case 'info':
      return sonnerToast.info(title, toastOptions);
    default:
      return sonnerToast(title, toastOptions);
  }
}
