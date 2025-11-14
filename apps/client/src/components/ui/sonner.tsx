import { useTheme } from 'next-themes';
import * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// Handy alias for Sonner's theme union
type SonnerTheme = NonNullable<ToasterProps['theme']>;

function coerceTheme(t?: string): SonnerTheme {
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
}

type Props = React.ComponentProps<typeof Sonner>;

export const Toaster = ({ ...props }: Props) => {
  const { theme } = useTheme();
  const resolvedTheme: SonnerTheme = coerceTheme(theme);

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};
