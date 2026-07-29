'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DATE_PICKER_DEFAULT_MIN,
  DATE_PICKER_EARLIEST_DATE,
  DATE_PICKER_LATEST_DATE,
} from '@codaco/shared-consts';

import { cx } from '../../utils/cva';
import type { CreateFormFieldProps } from '../Field/types';
import { todayYmd } from '../utils/ymd';
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

// The shared default arrives in the same YYYY-MM-DD form a caller-supplied
// bound does, so it is read by the same parser rather than restated as parts
// here. A malformed shared value is a source mistake, not a bound to ignore.
function requireYmd(value: string): Ymd {
  const parsed = parseYmd(value);
  if (!parsed) {
    throw new Error(`Expected a YYYY-MM-DD date bound, received "${value}".`);
  }
  return parsed;
}

function compareYmd(a: Ymd, b: Ymd): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function formatYmd(ymd: Ymd): string {
  const year = ymd.year.toString().padStart(4, '0');
  const month = ymd.month.toString().padStart(2, '0');
  const day = ymd.day.toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_MIN: Ymd = requireYmd(DATE_PICKER_DEFAULT_MIN);

// The coarse year/month dropdowns store `y.toString()` with no zero-padding,
// so the protocol schema's YYYY/YYYY-MM coarse values can only round-trip a
// four-digit year (1000-9999). These bracket the synthesized (non-authored)
// far bound below so the dropdown never offers a year it cannot itself emit.
const COARSE_MIN_YEAR = 1000;
const COARSE_MAX_YEAR = Number(DATE_PICKER_LATEST_DATE.slice(0, 4));

// The full-resolution native <input type="date"> is a different concern
// from the coarse dropdowns above: `formatYmd` always zero-pads to four
// digits, so it can mechanically represent any magnitude. But a year below 1
// formats with a leading '-' (not a valid HTML date string, so the browser
// drops the attribute entirely), and a year above 9999 is native-input-legal
// yet unreachable through `useProtocolForm`'s min/max validation, which
// compares the typed value against the AUTHORED bound string using
// four-digit LEXICAL comparison (`compareDateStrings`) — a five-digit
// synthesized year like "10105" sorts *before* a four-digit "9999"
// character-by-character, so every value between the authored bound and the
// synthesized one fails validation despite being pickable. These bracket the
// synthesized (non-authored) side of minYmd/maxYmd to the four-digit year
// range (0001-9999) so the native input never offers a value the validator
// can't accept.
const NATIVE_MIN_YEAR = Number(DATE_PICKER_EARLIEST_DATE.slice(0, 4));
const NATIVE_MAX_YEAR = Number(DATE_PICKER_LATEST_DATE.slice(0, 4));

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

  // Twenty-third-wave Findings 4, 5, and 8: an authored bound outside the
  // default 1920-to-today window must not collapse the resolvable range to
  // nothing OR to a single point. An absent (or unparseable) min falls back
  // to the default lower bound UNLESS the authored max is earlier than that
  // default, in which case the lower bound extends BELOW it by the default
  // window's own span (today's year minus 1920) so the picker still offers a
  // genuine range rather than pinning the variable to one value; an absent
  // max falls back to today UNLESS the authored min is later than today, in
  // which case the upper bound extends ABOVE it by the same span. The
  // extended bound reuses DEFAULT_MIN's month/day convention (a full
  // calendar year, January 1 through December 31) rather than the authored
  // bound's own month/day, so a partial month/year authored bound doesn't
  // leak an arbitrary sub-year boundary onto the far, unconstrained end.
  // When both bounds are authored, both are honoured exactly. `minYmd`/
  // `maxYmd` feed the full-resolution native input's `min`/`max` attributes
  // (only once at least one bound is authored — see `hasAuthoredBound` below;
  // a fully unbounded full-resolution DatePicker must stay genuinely
  // unbounded, matching how @codaco/protocol-validation's contradiction
  // analyser models it as contributing no interval). They're bracketed by
  // NATIVE_MIN_YEAR/NATIVE_MAX_YEAR (see that constant's comment) on the
  // SYNTHESIZED side only — an authored bound is left exactly as authored,
  // the schema's own job to validate — bounded by the authored opposite side
  // so the clamp can never invert the range (an authored `min: '9999-12-31'`
  // alone clamps its synthesized max to '9999-12-31' too, collapsing to a
  // genuine single-day domain rather than inverting past it).
  //
  // `coarseMinYmd`/`coarseMaxYmd` separately bracket the SYNTHESIZED
  // (non-authored) side to the four-digit year range (1000-9999) the coarse
  // year/month dropdowns can round-trip: those controls store `y.toString()`
  // with no zero-padding, so an unclamped synthesized edge like 894 would
  // offer a three-digit "894" the schema's YYYY/YYYY-MM coarse values can
  // never represent. This is a different concern from the native clamp
  // above (dropdown storage grammar vs. native-input/validator legality), so
  // the two pairs clamp to different bounds and are computed independently
  // from the same raw resolvedMin/resolvedMax. The year loop and the month
  // filtering at boundary years read the coarse pair.
  const { minYmd, maxYmd, coarseMinYmd, coarseMaxYmd, hasAuthoredBound } =
    useMemo(() => {
      const authoredMin = min ? parseYmd(min) : null;
      const authoredMax = max ? parseYmd(max) : null;
      // "Today" is read in UTC, from the same helper the relative picker
      // anchors on and the same one that produces the dates this field is
      // asked to display. A local reading would put this ceiling a day either
      // side of every other date in the system, so the offered months would
      // disagree with the value.
      const today = requireYmd(todayYmd());
      const defaultWindowSpanYears = today.year - DEFAULT_MIN.year;

      const resolvedMin =
        authoredMin ??
        (authoredMax && compareYmd(authoredMax, DEFAULT_MIN) < 0
          ? {
              year: authoredMax.year - defaultWindowSpanYears,
              month: 1,
              day: 1,
            }
          : DEFAULT_MIN);
      const resolvedMax =
        authoredMax ??
        (authoredMin && compareYmd(authoredMin, today) > 0
          ? {
              year: authoredMin.year + defaultWindowSpanYears,
              month: 12,
              day: 31,
            }
          : today);

      const nativeMin =
        authoredMin === null && resolvedMin.year < NATIVE_MIN_YEAR
          ? {
              year: Math.min(NATIVE_MIN_YEAR, resolvedMax.year),
              month: 1,
              day: 1,
            }
          : resolvedMin;
      const nativeMax =
        authoredMax === null && resolvedMax.year > NATIVE_MAX_YEAR
          ? {
              year: Math.max(NATIVE_MAX_YEAR, resolvedMin.year),
              month: 12,
              day: 31,
            }
          : resolvedMax;

      const coarseMin =
        authoredMin === null && resolvedMin.year < COARSE_MIN_YEAR
          ? {
              year: Math.min(COARSE_MIN_YEAR, resolvedMax.year),
              month: 1,
              day: 1,
            }
          : resolvedMin;
      const coarseMax =
        authoredMax === null && resolvedMax.year > COARSE_MAX_YEAR
          ? {
              year: Math.max(COARSE_MAX_YEAR, resolvedMin.year),
              month: 12,
              day: 31,
            }
          : resolvedMax;

      return {
        minYmd: nativeMin,
        maxYmd: nativeMax,
        coarseMinYmd: coarseMin,
        coarseMaxYmd: coarseMax,
        hasAuthoredBound: authoredMin !== null || authoredMax !== null,
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
      arr.push({ value: y.toString(), label: y.toString() });
    }
    return arr;
  }, [coarseMinYmd.year, coarseMaxYmd.year]);

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
  }, [selectedYear, coarseMinYmd, coarseMaxYmd]);

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
