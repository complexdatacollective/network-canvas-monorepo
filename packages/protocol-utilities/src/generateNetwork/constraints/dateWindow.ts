import { DATE_PICKER_DEFAULT_MIN } from '@codaco/shared-consts';

export type DateResolution = 'full' | 'month' | 'year';

/**
 * The earliest date each resolution's own control can represent.
 *
 * A full-resolution field is a native `<input type="date">`, whose dates start
 * at year 0001. The other two resolutions render a `<select>` listing their
 * years unpadded, so anything below year 1000 names an option that no
 * zero-padded bound can ever match.
 *
 * `buildConstraints` holds a bound the protocol *declares* to the same years.
 * This is where a floor the generator *derives* stops, which is a separate
 * escape: stepping back from an early ceiling underflows past year zero, and
 * `addSteps` then emits a string (`-996-12-25`, `00-5-01-04`) that no
 * comparison, count or draw can read.
 */
export const EARLIEST_OFFERED_DATE = {
  full: '0001-01-01',
  month: '1000-01',
  year: '1000',
} as const satisfies Record<DateResolution, string>;

/**
 * The latest date each resolution's own control can represent.
 *
 * Four digits is the whole of the rule, and every parser this ecosystem shares
 * states it: the runtime's date-bound matcher
 * (`/^\d{4}-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)?$/`, fresco-ui's
 * `matchesDatePattern`), `DatePickerField`'s `ymdPattern`, the protocol
 * schema's `isIsoDate`, and `CALENDAR_BOUND` in `buildConstraints`.
 * `truncateToResolution` slices at fixed offsets for the same reason.
 *
 * A five-digit year is worse than out of range: it is not read as a date at
 * all. `matchesDatePattern` refuses `10000-01-01`, so the max validator falls
 * back to comparing the two strings lexically — where a leading `1` sorts every
 * four-digit-year date *above* it. A window ceilinged there rejects every value
 * it contains, generated or typed.
 */
export const LATEST_OFFERED_DATE = {
  full: '9999-12-31',
  month: '9999-12',
  year: '9999',
} as const satisfies Record<DateResolution, string>;

/**
 * A closed date range at a single resolution. Bounds are strings at that
 * resolution: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.
 */
export type DateWindow = {
  min?: string;
  max?: string;
  resolution: DateResolution;
};

// Deliberately duplicated from fresco-ui's form/utils/ymd, which this package
// cannot depend on (protocol-utilities must stay free of UI dependencies).
// Arithmetic runs in UTC so bounds are stable regardless of runtime timezone;
// the runtime's min/max validators compare these strings lexically, so any
// drift would produce off-by-one-day failures near DST boundaries. The
// duplication is verified rather than trusted: @codaco/interview depends on
// both packages and holds the two implementations to the same results
// (src/forms/__tests__/ymdParity.test.ts). Constants shared with those fields
// are not duplicated at all — they live in @codaco/shared-consts, which this
// package already depends on.
function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Midnight UTC on a date whose year is read literally.
 *
 * `Date.UTC` — like the multi-argument `Date` constructor — maps a year of 0-99
 * into 1900-1999, so `0099-01-01` would be built as 1999-01-01 and every date
 * derived from it would leave the window the protocol declared. The picker
 * offers those years: a full-resolution field is a native `<input type="date">`,
 * whose dates start at year 0001, and the protocol schema admits 0001-0999
 * there deliberately. `setUTCFullYear` carries no two-digit-year special case,
 * so it is the only way to build one of them.
 */
export function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function addDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return ymd;
  }
  const date = utcDate(year, month, day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function todayYmd(): string {
  const now = new Date();
  return formatYmd(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
  );
}

export function truncateToResolution(
  value: string,
  resolution: DateResolution,
): string {
  if (resolution === 'year') return value.slice(0, 4);
  if (resolution === 'month') return value.slice(0, 7);
  return value.slice(0, 10);
}

function parts(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function addSteps(
  value: string,
  steps: number,
  resolution: DateResolution,
): string {
  if (resolution === 'full') {
    return addDays(value, steps);
  }

  const { year, month } = parts(value);
  if (resolution === 'year') {
    return String(year + steps).padStart(4, '0');
  }

  const total = year * 12 + (month - 1) + steps;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${String(newYear).padStart(4, '0')}-${String(newMonth).padStart(2, '0')}`;
}

export function stepsBetween(
  from: string,
  to: string,
  resolution: DateResolution,
): number {
  const a = parts(from);
  const b = parts(to);

  if (resolution === 'year') {
    return b.year - a.year;
  }
  if (resolution === 'month') {
    return b.year * 12 + b.month - (a.year * 12 + a.month);
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const fromMs = utcDate(a.year, a.month, a.day).getTime();
  const toMs = utcDate(b.year, b.month, b.day).getTime();
  return Math.round((toMs - fromMs) / msPerDay);
}

/**
 * The date `steps` from `anchor`, held between the earliest and latest dates
 * the resolution's own control can represent. A date outside that range is one
 * no participant could have entered, so a bound the generator *derives* stops
 * there rather than leaving the calendar. (A bound the protocol *declares* is
 * refused instead — `buildConstraints`' `requireCalendarBound`.)
 *
 * The offset is clamped, not the date it produces, because a date outside the
 * range is not a string any comparison can place. `addSteps` writes a year past
 * 9999 as five digits (`10000-01-01`), which sorts *below* every four-digit
 * year, and one before year zero as `-996-12-25` or `00-1-11-28`, which `parts`
 * silently reparses as some other date. Clamping in step space needs neither
 * shape to be recognised, and `stepsBetween` is exact for an anchor that is
 * itself a date the control offers.
 */
export function offsetWithinOfferedDates(
  anchor: string,
  steps: number,
  resolution: DateResolution,
): string {
  const earliest = stepsBetween(
    anchor,
    EARLIEST_OFFERED_DATE[resolution],
    resolution,
  );
  const latest = stepsBetween(
    anchor,
    LATEST_OFFERED_DATE[resolution],
    resolution,
  );
  return addSteps(
    anchor,
    Math.max(earliest, Math.min(steps, latest)),
    resolution,
  );
}

/**
 * The floor a date is drawn from when the protocol declares none: `span` steps
 * back from the window's ceiling, held at the earliest date the picker offers.
 * A ceiling already before that date is one the protocol declared, and reaching
 * behind it is then the only way to have a range at all — but no further back
 * than {@link EARLIEST_OFFERED_DATE}, which is where
 * {@link offsetWithinOfferedDates} stops it.
 *
 * Without that stop an early ceiling underflows: `max: "0005-01-01"` on a
 * full-date picker reaches `-996-12-25`, which `stepsBetween` reads as a window
 * of negative width. The count then calls the variable empty and feasibility
 * refuses a protocol whose field would have collected dates perfectly well,
 * while the draw writes a date from a year nobody asked for.
 *
 * Read by both the value-space count and the draw, which have to describe the
 * same window or feasibility is spending values the generator cannot reach.
 */
export function openDateFloor(
  max: string,
  span: number,
  resolution: DateResolution,
): string {
  const reach = offsetWithinOfferedDates(max, -span, resolution);
  const offered = truncateToResolution(DATE_PICKER_DEFAULT_MIN, resolution);
  return reach < offered && offered <= max ? offered : reach;
}
