import { cn } from '@/lib/utils';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export type AppToasterProps = ToasterProps & { className?: string };

export function Toaster({ className, ...props }: AppToasterProps) {
  return (
    <Sonner
      position="bottom-right"
      theme="system"
      richColors
      closeButton
      className={cn('z-[100]', className)}
      toastOptions={{
        classNames: {
          toast:
            'rounded-md border bg-popover text-popover-foreground shadow-lg',
          description: 'text-sm text-muted-foreground',
          actionButton:
            'inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-secondary',
          cancelButton:
            'inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-muted',
        },
      }}
      {...props}
    />
  );
}
