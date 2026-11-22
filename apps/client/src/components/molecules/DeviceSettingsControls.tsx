import { useState } from 'react';
// Shared controls for event-owned radios and the platform inventory.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function DeviceSelect({
  id,
  label,
  value,
  onChange,
  items,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map(item => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DeviceNumberPreset({
  id,
  label,
  value,
  onChange,
  presets,
  min,
  max,
  unit,
  locale,
  customLabel,
  recommendedLabel,
  recommended,
  disabled = false,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  presets: number[];
  min: number;
  max: number;
  unit: 'hour' | 'second';
  locale: string;
  customLabel: string;
  recommendedLabel: string;
  recommended: number;
  disabled?: boolean;
}) {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || !presets.includes(value);
  const format = new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
  });
  return (
    <div className="grid gap-2">
      <DeviceSelect
        id={id}
        label={label}
        value={isCustom ? 'custom' : String(value)}
        disabled={disabled}
        onChange={next => {
          setCustom(next === 'custom');
          if (next !== 'custom') onChange(Number(next));
        }}
        items={[
          ...presets.map(preset => ({
            value: String(preset),
            label: `${format.format(preset)}${preset === recommended ? ` · ${recommendedLabel}` : ''}`,
          })),
          { value: 'custom', label: customLabel },
        ]}
      />
      {isCustom && (
        <div className="grid gap-2">
          <Label htmlFor={`${id}-custom`}>{`${label} — ${customLabel}`}</Label>
          <Input
            id={`${id}-custom`}
            type="number"
            min={min}
            max={max}
            step={1}
            value={Number.isNaN(value) ? '' : value}
            disabled={disabled}
            onChange={event => {
              setCustom(true);
              onChange(event.target.valueAsNumber);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function normalizeRadioId(value: string, sourceType: string) {
  const trimmed = value.trim();
  return (sourceType === 'meshtastic' ? trimmed.replace(/^!/, '') : trimmed)
    .replace(/[:\-\s]/g, '')
    .toLowerCase();
}
