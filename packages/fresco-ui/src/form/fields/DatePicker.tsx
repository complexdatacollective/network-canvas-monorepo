'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { datePickerWindows } from '@codaco/shared-consts';

import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { todayYmd } from '../utils/ymd';
import InputField from './InputField';
import SelectField from './Select/Native';
import type { SelectOption } from './Select/shared';

type DatePickerFieldProps = CreateFormFieldProps<
  string,
  'input',
  {
    type?: 'full' | 'month' | 'year';
    size?: 'sm' | 'md' | 'lg';
    min?: string;
    max?: string;
    placeholder?: string;
  }
>;

type Ymd = { year: number; month: number; day: number };

// Accept full (YYYY-MM-DD) as well as the partial month (YYYY-MM) and year
// (YYYY) resolutions the architect emits for month/year DatePickers. Missing
// month/day components default to 1 so the year/month dropdown bounds still
// resolve from a truncated min/max.
const ymdPattern = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function parseYmd(value: string): Ymd | null {
  const match = ymdPattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return { year, month, day };
}

// The shared derivation answers in the same YYYY-MM-DD form a caller-supplied
// bound arrives in, so its four dates are read back by the same parser rather
// than restated as parts here. A malformed one is a source mistake, not a
// bound to ignore.
function requireYmd(value: string): Ymd {
  const parsed = parseYmd(value);
  if (!parsed) {
    throw new Error(`Expected a YYYY-MM-DD date bound, received "${value}".`);
  }
  return parsed;
}

function formatYmd(ymd: Ymd): string {
  const year = ymd.year.toString().padStart(4, '0');
  const month = ymd.month.toString().padStart(2, '0');
  const day = ymd.day.toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const messages = defineMessages({
  year: {
    id: 'frescoUi.datePicker.year',
    defaultMessage: 'Year',
    description: 'Label and placeholder of the year dropdown.',
  },
  month: {
    id: 'frescoUi.datePicker.month',
    defaultMessage: 'Month',
    description: 'Label and placeholder of the month dropdown.',
  },
});

const MONTH_VALUES = [
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
  '10',
  '11',
  '12',
] as const;

// Month names come from the intl object's own locale data rather than a baked
// English table; UTC anchors keep the label independent of the viewer's zone.
//
// The calendar is pinned because the option VALUES are not localized: `01`
// through `12`, stored as part of a Gregorian ISO date and shown beside a
// year the dropdown above prints verbatim. A locale that defaults to another
// calendar — fa-IR, or any tag carrying `u-ca-islamic` — would name these
// Gregorian anchors in that calendar's months, so picking the option labelled
// for one month would store a different one.
const buildMonthOptions = (
  formatDate: (date: Date, options: Intl.DateTimeFormatOptions) => string,
): SelectOption[] =>
  MONTH_VALUES.map((value) => ({
    value,
    label: formatDate(new Date(Date.UTC(2000, Number(value) - 1, 1)), {
      month: 'long',
      timeZone: 'UTC',
      calendar: 'gregory',
    }),
  }));

const getMonthParts = (value: unknown) => {
  if (typeof value !== 'string') {
    return { year: undefined, month: undefined };
  }

  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return {
    year: match?.[1],
    month: match?.[2],
  };
};

export default function DatePickerField(props: DatePickerFieldProps) {
  const intl = useAppIntl();
  const {
    type: resolutionType = 'full',
    min,
    max,
    value,
    onChange,
    name,
    size = 'md',
    placeholder,
    className,
    id,
    onBlur,
    onFocus,
    disabled,
    readOnly,
    ...rest
  } = props;

  // What a DatePicker's declared bounds resolve to, and where a bound it does
  // NOT declare falls: 1920-01-01 below and today above, extended by the
  // default window's own span when an authored bound already sits past that
  // edge, and clamped on the synthesized side to what each control can offer —
  // the four-digit year the coarse dropdowns store unpadded, and the
  // 0001-9999 range the native input's own min/max validator compares
  // lexically. All of that is `datePickerWindows` in `@codaco/shared-consts`,
  // because two other packages have to predict this exact window:
  // `@codaco/protocol-builder` reports a filter operand a coarse picker could
  // never offer, and `@codaco/protocol-validation`'s contradiction analyser
  // models the same derivation against a fixed horizon rather than a clock. A
  // copy per reader is what let them drift.
  //
  // `hasAuthoredBound` is why the derivation cannot simply be applied: a fully
  // unbounded FULL-resolution picker must stay unbounded (the native input
  // gets no min/max at all), while the month and year dropdowns are closed
  // lists and take the synthesized window either way.
  const { minYmd, maxYmd, coarseMinYmd, coarseMaxYmd, hasAuthoredBound } =
    useMemo(() => {
      // "Today" is read in UTC, from the same helper the relative picker
      // anchors on and the same one that produces the dates this field is
      // asked to display. A local reading would put this ceiling a day either
      // side of every other date in the system, so the offered months would
      // disagree with the value.
      const windows = datePickerWindows(
        {
          ...(min === undefined ? {} : { min }),
          ...(max === undefined ? {} : { max }),
        },
        todayYmd(),
      );
      return {
        minYmd: requireYmd(windows.native.min),
        maxYmd: requireYmd(windows.native.max),
        coarseMinYmd: requireYmd(windows.coarse.min),
        coarseMaxYmd: requireYmd(windows.coarse.max),
        hasAuthoredBound: windows.hasAuthoredBound,
      };
    }, [min, max]);

  const initialMonthParts = getMonthParts(value);
  const [selectedYear, setSelectedYear] = useState<string | undefined>(
    initialMonthParts.year,
  );
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(
    initialMonthParts.month,
  );
  const pendingIncompletePartsRef = useRef<{
    year?: string;
    month?: string;
  } | null>(null);

  useEffect(() => {
    if (resolutionType !== 'month') {
      pendingIncompletePartsRef.current = null;
      setSelectedYear(undefined);
      setSelectedMonth(undefined);
      return;
    }

    const parts = getMonthParts(value);
    if (
      (value === undefined || value === null || value === '') &&
      parts.year === undefined &&
      parts.month === undefined &&
      pendingIncompletePartsRef.current
    ) {
      const pendingParts = pendingIncompletePartsRef.current;
      setSelectedYear(pendingParts.year);
      setSelectedMonth(pendingParts.month);
      return;
    }

    pendingIncompletePartsRef.current = null;
    setSelectedYear(parts.year);
    setSelectedMonth(parts.month);
  }, [value, resolutionType]);

  const years = useMemo(() => {
    const arr: SelectOption[] = [];
    for (let y = coarseMaxYmd.year; y >= coarseMinYmd.year; y--) {
      // The value is the ASCII year the stored ISO date is built from and
      // must stay that whatever the language; the label is a number on its
      // own in a menu of translated months, so it is written in the reader's
      // digits. Ungrouped, because a year is not a quantity — "2,000" would
      // be a different thing entirely.
      arr.push({
        value: y.toString(),
        label: intl.formatNumber(y, { useGrouping: false }),
      });
    }
    return arr;
  }, [coarseMinYmd.year, coarseMaxYmd.year, intl]);

  const months = useMemo(
    () => buildMonthOptions((date, options) => intl.formatDate(date, options)),
    [intl],
  );

  const getAvailableMonths = (yearValue?: string) => {
    if (!yearValue) return months;
    const year = Number.parseInt(yearValue, 10);
    let startMonth = 1;
    let endMonth = 12;
    if (year === coarseMinYmd.year) startMonth = coarseMinYmd.month;
    if (year === coarseMaxYmd.year) endMonth = coarseMaxYmd.month;
    return months.filter((m) => {
      const monthNum = Number.parseInt(String(m.value), 10);
      return monthNum >= startMonth && monthNum <= endMonth;
    });
  };

  const availableMonths = useMemo(() => {
    return getAvailableMonths(selectedYear);
    // getAvailableMonths is a pure calculation over the listed date bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, coarseMinYmd, coarseMaxYmd, months]);

  const handleChange = (year?: string, month?: string) => {
    const newYear = year === '' ? undefined : (year ?? selectedYear);
    let newMonth = month === '' ? undefined : (month ?? selectedMonth);

    if (
      year !== undefined &&
      newMonth !== undefined &&
      !getAvailableMonths(newYear).some(
        (option) => String(option.value) === newMonth,
      )
    ) {
      newMonth = undefined;
    }

    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    // A month-resolution value is only valid when both controls are complete.
    // Emit `undefined` for every incomplete combination, including when moving
    // to a boundary year invalidates the previously selected month. Otherwise
    // a controlled parent can retain a stale complete value that is no longer
    // represented by the two visible controls.
    const nextValue =
      newYear && newMonth ? `${newYear}-${newMonth}` : undefined;
    pendingIncompletePartsRef.current =
      nextValue === undefined && onChange
        ? { year: newYear, month: newMonth }
        : null;
    onChange?.(nextValue);
  };

  const interactionDisabled = Boolean(disabled) || Boolean(readOnly);
  const yearPartLabelId = id ? `${id}-year-part` : undefined;
  const monthPartLabelId = id ? `${id}-month-part` : undefined;
  const labelledBy = rest['aria-labelledby'];
  const yearLabelledBy = [labelledBy, yearPartLabelId]
    .filter(Boolean)
    .join(' ');
  const monthLabelledBy = [labelledBy, monthPartLabelId]
    .filter(Boolean)
    .join(' ');
  const controlAriaProps = {
    'aria-invalid': rest['aria-invalid'],
    'aria-describedby': rest['aria-describedby'],
    'aria-required': rest['aria-required'],
    'aria-disabled': rest['aria-disabled'] || disabled || undefined,
    'aria-readonly': rest['aria-readonly'] || readOnly || undefined,
  };

  if (resolutionType === 'month') {
    return (
      <div className={cx('flex gap-2', className)}>
        {yearPartLabelId && (
          <span id={yearPartLabelId} className="sr-only">
            {intl.formatMessage(messages.year)}
          </span>
        )}
        {monthPartLabelId && (
          <span id={monthPartLabelId} className="sr-only">
            {intl.formatMessage(messages.month)}
          </span>
        )}
        <SelectField
          id={id}
          size={size}
          name={name ? `${name}-year` : undefined}
          options={years}
          placeholder={intl.formatMessage(messages.year)}
          value={selectedYear}
          onChange={(selectValue) =>
            handleChange(String(selectValue), undefined)
          }
          disabled={interactionDisabled}
          onBlur={onBlur}
          onFocus={onFocus}
          {...controlAriaProps}
          aria-labelledby={yearLabelledBy || undefined}
          className="w-fit"
        />
        <SelectField
          id={id ? `${id}-month` : undefined}
          size={size}
          name={name ? `${name}-month` : undefined}
          options={availableMonths}
          placeholder={intl.formatMessage(messages.month)}
          value={selectedMonth}
          onChange={(selectValue) =>
            handleChange(undefined, String(selectValue))
          }
          disabled={interactionDisabled || !selectedYear}
          onBlur={onBlur}
          onFocus={onFocus}
          {...controlAriaProps}
          aria-labelledby={monthLabelledBy || undefined}
          className="w-fit"
        />
      </div>
    );
  }

  if (resolutionType === 'year') {
    return (
      <SelectField
        id={id}
        size={size}
        options={years}
        placeholder={intl.formatMessage(messages.year)}
        value={value}
        onChange={(v) =>
          onChange?.(v === undefined || v === '' ? undefined : String(v))
        }
        name={name}
        disabled={interactionDisabled}
        onBlur={onBlur}
        onFocus={onFocus}
        {...controlAriaProps}
        aria-label={rest['aria-label']}
        aria-labelledby={labelledBy}
        className={cx('w-fit', className)}
      />
    );
  }

  return (
    <InputField
      {...rest}
      id={id}
      type="date"
      size={size}
      // A fully unbounded full-resolution picker (neither min nor max
      // authored) must stay unbounded: falling back to the 1920-to-today
      // default window here would silently block dates outside it (e.g. a
      // pre-1920 birthdate, or any future date) that were always enterable
      // before bounds existed. Once at least one bound is authored, both
      // attributes come from the shared derivation above so this input
      // can't disagree with the year/month picker's default window.
      min={hasAuthoredBound ? formatYmd(minYmd) : undefined}
      max={hasAuthoredBound ? formatYmd(maxYmd) : undefined}
      value={value}
      onChange={(v) => onChange?.(v === undefined || v === '' ? undefined : v)}
      name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      className={cx('outline-input-contrast', className)}
      disabled={disabled}
      readOnly={readOnly}
    />
  );
}
