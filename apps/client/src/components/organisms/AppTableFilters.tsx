import { Button, Checkbox, Input } from '@/components/atoms';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

export type SelectOption = { value: string; label: string };
export type DateRangeValue = {
  range: DateRange | undefined;
  fromTime: string;
  toTime: string;
};

export type AppMultiSelectFilterProps = {
  placeholder: string;
  options: readonly SelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  selectedCountLabel: (count: number) => string;
  clearLabel: string;
};

export const AppMultiSelectFilter = ({
  placeholder,
  options,
  selected,
  onChange,
  selectedCountLabel,
  clearLabel,
}: AppMultiSelectFilterProps) => {
  const toggleValue = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(item => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? selected[0]
      : selectedCountLabel(selected.length);

  return (
    <div className="mt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-full justify-between text-xs font-normal"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 max-h-64 overflow-auto p-2"
          align="start"
        >
          <div className="space-y-1">
            {options.map(option => {
              const isChecked = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleValue(option.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <Checkbox checked={isChecked} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              className="mt-2 h-7 w-full text-xs"
              onClick={() => onChange([])}
            >
              {clearLabel}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export type AppDateRangeFilterProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  label: string;
  fromLabel: string;
  toLabel: string;
  clearLabel: string;
  timeFromLabel: string;
  timeToLabel: string;
};

export const AppDateRangeFilter = ({
  value,
  onChange,
  label,
  fromLabel,
  toLabel,
  clearLabel,
  timeFromLabel,
  timeToLabel,
}: AppDateRangeFilterProps) => {
  const from = value.range?.from;
  const to = value.range?.to;
  const summary = from
    ? to
      ? `${format(from, 'd. M. yyyy')} – ${format(to, 'd. M. yyyy')}`
      : `${format(from, 'd. M. yyyy')} – …`
    : label;

  return (
    <div className="mt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              'h-9 w-full justify-between px-3 text-left font-normal',
              !from && 'text-muted-foreground'
            )}
          >
            <span className="truncate">{summary}</span>
            <span className="ml-2 flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 opacity-60" />
              <ChevronDown className="h-4 w-4 opacity-60" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="rounded-md border">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={value.range}
              onSelect={range =>
                onChange({
                  ...value,
                  range,
                })
              }
              className="p-0"
              {...(from ? { defaultMonth: from } : {})}
            />

            <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {timeFromLabel}
                </span>
                <Input
                  type="time"
                  step="1"
                  value={value.fromTime}
                  onChange={event =>
                    onChange({ ...value, fromTime: event.target.value })
                  }
                  className="h-9"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {timeToLabel}
                </span>
                <Input
                  type="time"
                  step="1"
                  value={value.toTime}
                  onChange={event =>
                    onChange({ ...value, toTime: event.target.value })
                  }
                  className="h-9"
                />
              </label>
            </div>

            <div className="flex items-center justify-between border-t p-3">
              <span className="text-xs text-muted-foreground">
                {fromLabel} / {toLabel}
              </span>
              {(value.range?.from || value.range?.to) && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-2 text-xs"
                  onClick={() =>
                    onChange({ range: undefined, fromTime: '', toTime: '' })
                  }
                >
                  {clearLabel}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
