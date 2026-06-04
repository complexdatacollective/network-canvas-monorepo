'use client';

import Button from '../../Button';
import InputField from '../../form/fields/InputField';
import { type DateFilterConfig, type DateFilterValue } from './types';

type DateFilterProps = {
  value: DateFilterValue | undefined;
  onChange: (value: DateFilterValue | undefined) => void;
  config: DateFilterConfig;
};

type RelativePreset = {
  label: string;
  days: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const relativePresets: RelativePreset[] = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

function toISODate(date: Date): string {
  // YYYY-MM-DD in local time, matching how luxon's toISODate() behaves.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayISO(): string {
  return toISODate(new Date());
}

function getPresetRange(days: number): DateFilterValue {
  const now = new Date();
  const to = toISODate(now);
  const from =
    days === 0 ? to : toISODate(new Date(now.getTime() - days * MS_PER_DAY));
  return { from, to };
}

function isPresetActive(
  value: DateFilterValue | undefined,
  days: number,
): boolean {
  if (!value) return false;
  const preset = getPresetRange(days);
  return value.from === preset.from && value.to === preset.to;
}

export default function DateFilter({
  value,
  onChange,
  config: _config,
}: DateFilterProps) {
  const handlePresetClick = (days: number) => {
    if (isPresetActive(value, days)) {
      onChange(undefined);
    } else {
      onChange(getPresetRange(days));
    }
  };

  const handleFromChange = (from: string) => {
    if (!from) {
      onChange(undefined);
      return;
    }
    const to = value?.to ?? todayISO();
    onChange({ from, to });
  };

  const handleToChange = (to: string) => {
    if (!to) {
      onChange(undefined);
      return;
    }
    const from = value?.from ?? to;
    onChange({ from, to });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {relativePresets.map((preset) => (
          <Button
            key={preset.label}
            size="sm"
            variant="default"
            color={isPresetActive(value, preset.days) ? 'success' : 'default'}
            onClick={() => handlePresetClick(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <InputField
          type="date"
          name="filter-date-from"
          size="sm"
          value={value?.from ?? ''}
          onChange={(val) => handleFromChange(val ?? '')}
          className="min-w-0 flex-1"
        />
        <span className="text-text/60 text-xs">to</span>
        <InputField
          type="date"
          name="filter-date-to"
          size="sm"
          value={value?.to ?? ''}
          onChange={(val) => handleToChange(val ?? '')}
          className="min-w-0 flex-1"
        />
      </div>
    </div>
  );
}
