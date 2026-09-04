'use client';

import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button from '../../Button';
import InputField from '../../form/fields/InputField';
import { type DateFilterConfig, type DateFilterValue } from './types';

type DateFilterProps = {
  value: DateFilterValue | undefined;
  onChange: (value: DateFilterValue | undefined) => void;
  config: DateFilterConfig;
};

const messages = defineMessages({
  presetToday: {
    id: 'frescoUi.dateFilter.presetToday',
    defaultMessage: 'Today',
    description: 'Relative date-range preset covering the current day.',
  },
  presetLastDays: {
    id: 'frescoUi.dateFilter.presetLastDays',
    defaultMessage: 'Last {days} days',
    description:
      'Relative date-range preset covering the last {days} days up to today.',
  },
  rangeSeparator: {
    id: 'frescoUi.dateFilter.rangeSeparator',
    defaultMessage: 'to',
    description:
      'Word shown between the start and end date inputs of a date-range filter.',
  },
});

type RelativePreset = {
  message: MessageDescriptor;
  days: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const relativePresets: RelativePreset[] = [
  { message: messages.presetToday, days: 0 },
  { message: messages.presetLastDays, days: 7 },
  { message: messages.presetLastDays, days: 30 },
  { message: messages.presetLastDays, days: 90 },
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
  const intl = useAppIntl();

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
            key={preset.days}
            size="sm"
            variant="default"
            color={isPresetActive(value, preset.days) ? 'success' : 'default'}
            onClick={() => handlePresetClick(preset.days)}
          >
            {intl.formatMessage(preset.message, { days: preset.days })}
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
        <span className="text-text/60 text-xs">
          {intl.formatMessage(messages.rangeSeparator)}
        </span>
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
