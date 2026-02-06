import { Badge, Button } from '@/components/atoms';
import { AppFilters } from '@/components/organisms';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ChevronDown, Eye, EyeOff, Filter, FilterX, RefreshCw, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type PresetFilter =
  | 'si_card_change'
  | 'note_change'
  | 'late_start_change'
  | 'did_not_start'
  | 'all';

export type ReportFilterConfig = {
  key: PresetFilter;
  label: string;
  icon: ReactNode;
};

type ReportFiltersProps = {
  presetFilters: ReportFilterConfig[];
  activePresetFilters: Set<PresetFilter>;
  filterLabels: Record<PresetFilter, string>;
  onTogglePresetFilter: (filter: PresetFilter) => void;
  onRefresh: () => void;
  onClearFilters: () => void;
  onToggleProcessedVisibility: () => void;
  hideProcessed: boolean;
  refreshLabel: string;
  isFetching?: boolean;
};

export const ReportFilters = ({
  presetFilters,
  activePresetFilters,
  filterLabels,
  onTogglePresetFilter,
  onRefresh,
  onClearFilters,
  onToggleProcessedVisibility,
  hideProcessed,
  refreshLabel,
  isFetching,
}: ReportFiltersProps) => {
  const { t } = useTranslation();
  const activeFilters = [...activePresetFilters].filter(f => f !== 'all');

  return (
    <AppFilters
      renderPresets={
        <>
          <div className="hidden flex-wrap gap-2 sm:flex">
            {presetFilters.map(filter => {
              const isActive = activePresetFilters.has(filter.key);

              return (
                <Button
                  key={filter.key}
                  type="button"
                  variant="outline"
                  onClick={() => onTogglePresetFilter(filter.key)}
                  className={cn(
                    'gap-2 text-xs shrink-0',
                    isActive
                      ? 'bg-accent text-accent-foreground border-primary shadow-sm hover:bg-accent/80 dark:bg-white/90 dark:text-slate-900 dark:hover:bg-white'
                      : 'border-border'
                  )}
                >
                  {filter.icon}
                  <span>{filter.label}</span>
                </Button>
              );
            })}
          </div>
          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  {t('Pages.Event.Report.PresetsTitle')}
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {presetFilters.map(filter => (
                  <DropdownMenuCheckboxItem
                    key={filter.key}
                    checked={activePresetFilters.has(filter.key)}
                    onCheckedChange={() => onTogglePresetFilter(filter.key)}
                  >
                    <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                      {filter.icon}
                    </span>
                    {filter.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      }
      renderActive={
        activeFilters.length > 0 ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div>{t('Pages.Event.Report.ActiveFilters')}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeFilters.map(filter => (
                <Badge
                  key={filter}
                  variant="default"
                  className="gap-1 bg-primary text-primary-foreground"
                >
                  {filterLabels[filter]}
                  <button
                    type="button"
                    onClick={() => onTogglePresetFilter(filter)}
                    className="rounded-full p-0.5 hover:bg-primary/70"
                    aria-label={`Odebrat filtr ${filterLabels[filter]}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ) : null
      }
      renderActions={
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={onRefresh}>
            <RefreshCw
              className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')}
            />
            {t('Pages.Event.Report.Buttons.RefreshData')}
          </Button>
          <Button type="button" variant="outline" onClick={onClearFilters}>
            <FilterX className="mr-2 h-4 w-4" />
            {t('Pages.Event.Report.Buttons.ClearFilters')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onToggleProcessedVisibility}
          >
            {hideProcessed ? (
              <Eye className="mr-2 h-4 w-4" />
            ) : (
              <EyeOff className="mr-2 h-4 w-4" />
            )}
            {hideProcessed
              ? t('Pages.Event.Report.Buttons.ShowProcessed')
              : t('Pages.Event.Report.Buttons.HideProcessed')}
          </Button>
          <span className="text-sm text-muted-foreground">{refreshLabel}</span>
        </div>
      }
    />
  );
};
