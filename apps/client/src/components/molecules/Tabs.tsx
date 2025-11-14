import {
  Tabs as ShadTabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import * as React from 'react';

type TabItem =
  | string
  | {
      value: string;
      label: React.ReactNode;
      disabled?: boolean;
    };

export type TabsProps = {
  tabs: TabItem[];
  children: React.ReactNode[]; // should align with `tabs`
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;

  className?: string;
  listClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
};

function normalizeTabs(items: TabItem[]) {
  return items.map(it =>
    typeof it === 'string' ? { value: it, label: it } : it
  );
}

export const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
  (
    {
      tabs,
      children,
      defaultValue,
      value,
      onValueChange,
      className,
      listClassName,
      triggerClassName,
      contentClassName,
    },
    ref
  ) => {
    const normalized = React.useMemo(() => normalizeTabs(tabs), [tabs]);

    // Warn if lengths do not match to avoid silent UI mismatch
    if (import.meta.env.DEV && normalized.length !== children.length) {
       
      console.warn(
        '[Tabs] `tabs` and `children` length mismatch:',
        normalized.length,
        children.length
      );
    }

    const initial = defaultValue ?? normalized[0]?.value;

    return (
      <ShadTabs
        ref={ref}
        className={cn(className)}
        {...(value !== undefined ? { value } : {})}
        {...(onValueChange ? { onValueChange } : {})}
        {...(initial !== undefined ? { defaultValue: initial } : {})}
      >
        <TabsList className={cn(listClassName)}>
          {normalized.map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={cn(triggerClassName)}
              {...(t.disabled !== undefined ? { disabled: t.disabled } : {})}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {normalized.map((t, idx) => (
          <TabsContent
            key={t.value}
            value={t.value}
            className={cn(contentClassName)}
          >
            {children[idx]}
          </TabsContent>
        ))}
      </ShadTabs>
    );
  }
);

Tabs.displayName = 'Tabs';
