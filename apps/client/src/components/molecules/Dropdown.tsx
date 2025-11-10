import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import * as React from 'react';

export type DropdownProps = {
  /** Trigger content (button, icon, anything) */
  trigger: React.ReactNode;
  /** Menu content: use shadcn items (DropdownMenuItem, Label, Separator, …) */
  children: React.ReactNode;
  /** Extra class for the content (Content) – shadcn defaults remain intact */
  className?: string;
  /** Alignment of the content relative to the trigger (shadcn/Radix prop) */
  align?: 'start' | 'center' | 'end';
  /** Side on which the menu appears (shadcn/Radix prop) */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Offset from the trigger (px) */
  sideOffset?: number;
  /** Whether to use `asChild` for the trigger (useful for custom buttons) */
  asChildTrigger?: boolean;
};

/**
 * Dropdown (Molecule)
 * - Lightweight wrapper around shadcn/ui DropdownMenu.
 * - Handles trigger and content; pass menu items through `children`.
 */
export const Dropdown = ({
  trigger,
  children,
  className,
  align = 'end',
  side = 'bottom',
  sideOffset = 4,
  asChildTrigger = true,
}: DropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChildTrigger}>
        {/* If you don't use asChild, Radix will render a <button> */}
        {asChildTrigger ? (
          // if `trigger` is e.g. a <button> or <div>, it passes through unchanged
          <>{trigger}</>
        ) : (
          // fallback – wrap trigger in a <button>
          <button type="button">{trigger}</button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={cn(className)}
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
Dropdown.displayName = 'Dropdown';
