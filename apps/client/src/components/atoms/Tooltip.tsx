import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ComponentPropsWithoutRef } from 'react';
import * as React from 'react';

type ContentProps = ComponentPropsWithoutRef<typeof TooltipContent>;

export type TooltipProps = {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: ContentProps['side'];
  align?: ContentProps['align'];
  sideOffset?: ContentProps['sideOffset'];
};

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  side,
  align,
  sideOffset,
}) => {
  const contentProps: Partial<ContentProps> = {
    ...(side !== undefined && { side }),
    ...(align !== undefined && { align }),
    ...(sideOffset !== undefined && { sideOffset }),
  };

  return (
    <TooltipProvider>
      <ShadcnTooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent {...contentProps}>{content}</TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
};

export default Tooltip;
