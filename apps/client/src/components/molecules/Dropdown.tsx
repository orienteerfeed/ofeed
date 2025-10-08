import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import * as React from 'react';

export type DropdownProps = {
  /** Obsah spouštěče (tlačítko, ikona, cokoliv) */
  trigger: React.ReactNode;
  /** Obsah menu: použij shadcn položky (DropdownMenuItem, Label, Separator, …) */
  children: React.ReactNode;
  /** Extra class pro obsah (Content) – shadcn defaulty zůstávají zachovány */
  className?: string;
  /** Zarovnání obsahu vůči triggeru (shadcn/Radix prop) */
  align?: 'start' | 'center' | 'end';
  /** Strana, na které se menu objeví (shadcn/Radix prop) */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Offset od triggeru (px) */
  sideOffset?: number;
  /** Zda použít `asChild` pro trigger (užitečné pro vlastní buttony) */
  asChildTrigger?: boolean;
};

/**
 * Dropdown (Molecule)
 * - Lehký obal nad shadcn/ui DropdownMenu.
 * - Řeší trigger a content; položky menu předej v `children`.
 */
export function Dropdown({
  trigger,
  children,
  className,
  align = 'end',
  side = 'bottom',
  sideOffset = 4,
  asChildTrigger = true,
}: DropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChildTrigger}>
        {/* Když nepoužiješ asChild, Radix vyrenderuje <button> */}
        {asChildTrigger ? (
          // když `trigger` je např. <button> nebo <div>, projde beze změny
          <>{trigger}</>
        ) : (
          // fallback – zabalení triggeru do <button>
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
}
