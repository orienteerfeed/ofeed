import {
  Button as ShadButton,
  buttonVariants as shadButtonVariants,
} from '@/components/ui/button';
import { type VariantProps } from 'class-variance-authority';
import * as React from 'react';

// If you want to expose the button’s variant/size types for external use:
export type ButtonVariantProps = VariantProps<typeof shadButtonVariants>;

// The simplest and safest props type is whatever shadcn's Button already accepts:
export type ButtonProps = React.ComponentPropsWithoutRef<typeof ShadButton>;

// Minimal passthrough wrapper (keeps shadcn styles/behavior)
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => <ShadButton ref={ref} {...props} />
);
Button.displayName = 'Button';

// Re-export variants so you can build classNames elsewhere if needed
export const buttonVariants = shadButtonVariants;
