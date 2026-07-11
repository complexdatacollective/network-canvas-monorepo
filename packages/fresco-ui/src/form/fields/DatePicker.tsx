'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import InputField from './InputField';
import SelectField from './Select/Native';
import type { SelectOption } from './Select/shared';

// Native <input type="date"> doesn't expose its empty-state "mm/dd/yyyy" hint
// via ::placeholder, and `:placeholder-shown` doesn't match a date input with
// no value, so `placeholder:` utilities never reach it. We conditionally apply
// muted-italic styling when the value is empty: `color`/`italic` on the input
// itself handles Firefox; the webkit-datetime-edit pseudo-element handles
// Chromium/Safari where the color property doesn't cascade through. Safari
// additionally repaints the empty day/month/year sub-fields with its own
// contrast-adjusted color (a greenish tint on dark backgrounds) and only
// -webkit-text-fill-color pins them; Blink honours `color`, so the extra
// declaration is a no-op there.
const emptyDateInputClass = cx(
  'text-input-contrast/50 italic',
  '[&::-webkit-datetime-edit]:text-input-contrast/50',
  '[&::-webkit-datetime-edit]:italic',
  // NOTE: must reference --input-contrast (the runtime theme variable), not
  // --color-input-contrast — the Tailwind theme is `inline`, so --color-*
  // tokens are compiled away and never exist at runtime.
  '[&::-webkit-datetime-edit]:[-webkit-text-fill-color:color-mix(in_oklab,var(--input-contrast)_50%,transparent)]',
);

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

function todayYmd(): Ymd {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

const DEFAULT_MIN: Ymd = { year: 1920, month: 1, day: 1 };

const months: SelectOption[] = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

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

  const minYmd = useMemo(
    () => (min ? (parseYmd(min) ?? DEFAULT_MIN) : DEFAULT_MIN),
    [min],
  );
  const maxYmd = useMemo(
    () => (max ? (parseYmd(max) ?? todayYmd()) : todayYmd()),
    [max],
  );

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
    for (let y = maxYmd.year; y >= minYmd.year; y--) {
      arr.push({ value: y.toString(), label: y.toString() });
    }
    return arr;
  }, [minYmd.year, maxYmd.year]);

  const getAvailableMonths = (yearValue?: string) => {
    if (!yearValue) return months;
    const year = Number.parseInt(yearValue, 10);
    let startMonth = 1;
    let endMonth = 12;
    if (year === minYmd.year) startMonth = minYmd.month;
    if (year === maxYmd.year) endMonth = maxYmd.month;
    return months.filter((m) => {
      const monthNum = Number.parseInt(String(m.value), 10);
      return monthNum >= startMonth && monthNum <= endMonth;
    });
  };

  const availableMonths = useMemo(() => {
    return getAvailableMonths(selectedYear);
    // getAvailableMonths is a pure calculation over the listed date bounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, minYmd, maxYmd]);

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
            Year
          </span>
        )}
        {monthPartLabelId && (
          <span id={monthPartLabelId} className="sr-only">
            Month
          </span>
        )}
        <SelectField
          id={id}
          size={size}
          name={name ? `${name}-year` : undefined}
          options={years}
          placeholder="Year"
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
          placeholder="Month"
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
        placeholder="Year"
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
      min={min}
      max={max}
      value={value}
      onChange={(v) => onChange?.(v === undefined || v === '' ? undefined : v)}
      name={name}
      onBlur={onBlur}
      onFocus={onFocus}
      placeholder={placeholder}
      className={cx(
        'outline-input-contrast',
        !value && emptyDateInputClass,
        className,
      )}
      disabled={disabled}
      readOnly={readOnly}
    />
  );
}
