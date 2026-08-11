import {
  DATE_PICKER_DEFAULT_MIN,
  DATE_PICKER_EARLIEST_DATE,
  DATE_PICKER_LATEST_DATE,
  dateWithinPickerRange,
} from '@codaco/shared-consts';

export type DateResolution = 'full' | 'month' | 'year';

/**
 * The earliest date each resolution's own control can represent.
 *
 * A full-resolution field is a native `<input type="date">`, whose dates start
 * at year 0001 — the same fact the interview's own fields read, so it is stated
 * once in shared-consts rather than here. The other two resolutions render a
 * `<select>` listing their years unpadded, so anything below year 1000 names an
 * option that no zero-padded bound can ever match; no field outside this package
 * derives a bound at those resolutions, so those two ends stay here.
 *
 * `buildConstraints` holds a bound the protocol *declares* to the same years.
 * This is where a floor the generator *derives* stops, which is a separate
 * escape: stepping back from an early ceiling underflows past year zero, and
 * `addSteps` then emits a string (`-996-12-25`, `00-5-01-04`) that no
 * comparison, count or draw can read.
 */
export const EARLIEST_OFFERED_DATE = {
  full: DATE_PICKER_EARLIEST_DATE,
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
  full: DATE_PICKER_LATEST_DATE,
  month: DATE_PICKER_LATEST_DATE.slice(0, 7),
  year: DATE_PICKER_LATEST_DATE.slice(0, 4),
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

// A second, independent copy of the UTC arithmetic @codaco/shared-consts
// keeps privately in date-fields.ts for `dateWithinPickerRange`. That export
// only derives a *window's* two ends; `addSteps` and `stepsBetween` below use
// this copy to step and measure a date at an arbitrary offset *inside* an
// already-derived window instead — drawing a value, or moving a bound by one
// step to make a comparator strict — which shared-consts has no exported
// entry point for. Arithmetic runs in UTC so results are stable regardless of
// runtime timezone; the runtime's min/max validators compare these strings
// lexically, so a drift between the two copies would produce off-by-one-day
// failures near a DST boundary, or a value drawn outside the window it was
// meant to land in.
//
// Nothing compares the two implementations against each other directly any
// more: shared-consts never exported its copy past date-fields.ts, this
// package's copy is no longer re-exported from its own public entry point
// either now that nothing outside the package consumes it, and fresco-ui's
// copy — the one @codaco/interview's ymdParity.test.ts used to hold this to —
// is gone now that RelativeDatePickerField derives its window through
// `dateWithinPickerRange` instead. The pairing is instead verified
// behaviourally: @codaco/interview's relativeDateWindowParity.test.tsx draws
// real values through this file's `addSteps` and confirms every one lands
// inside the window `dateWithinPickerRange` derived for the same parameters,
// across low-year and calendar-edge cases — so a drift between the two copies
// would surface there as a generated value outside the window the interview
// validates.
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

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, before the calendar is consulted. */
const DATE_SHAPE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;

/** The resolution each written length belongs to. */
const RESOLUTION_OF_LENGTH: Record<number, DateResolution> = {
  4: 'year',
  7: 'month',
  10: 'full',
};

/**
 * The resolution a value's length would name, or `undefined` where the string
 * is not even shaped like a date. Shared by both calendar-validating readers
 * below, neither of which has anything to validate until it has this to build
 * a candidate date from.
 */
function dateShapeResolution(value: string): DateResolution | undefined {
  if (!DATE_SHAPE.test(value)) return undefined;
  return RESOLUTION_OF_LENGTH[value.length];
}

/**
 * The same shape, with every component held to the range the control's own
 * parser accepts: month 01-12, day 01-31 whatever month it follows. This is
 * `DatePickerField`'s `ymdPattern` plus the range check `parseYmd` applies to
 * its captures, written as one pattern.
 */
const PICKER_READABLE_BOUND =
  /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;

/**
 * The resolution a bound is written at, where `DatePickerField` can read it at
 * all — `undefined` otherwise.
 *
 * Separate from {@link boundResolution} because a bound outside those ranges is
 * worse for the field than one naming a day its month does not hold. `parseYmd`
 * returns null for it, and the field then falls back to its own default bound
 * (`DATE_PICKER_DEFAULT_MIN`, or today at the ceiling) while the interview's
 * validator goes on comparing against the declared string: the control offers
 * dates the submit refuses. A day the calendar rejects still parses, so the
 * control and the validator agree about it, and whether it can be honoured is
 * then a question about which components that picker renders — which is what
 * {@link boundResolution} over a truncated bound answers.
 */
export function pickerBoundResolution(
  value: string,
): DateResolution | undefined {
  if (!PICKER_READABLE_BOUND.test(value)) return undefined;
  return RESOLUTION_OF_LENGTH[value.length];
}

/**
 * The resolution a bound the protocol *declares* is written at, or `undefined`
 * where it names no date.
 *
 * Built on the year-safe {@link utcDate} rather than a bare `Date.UTC` call,
 * and its check reads the resulting year back alongside the month and day: a
 * declared `min`/`max` can carry a two-digit year (`0099-01-01`), which
 * `Date.UTC`'s own two-digit-year special case would silently remap to 1999
 * and validate as a different, later date rather than as the year that was
 * actually written. A day the calendar does not hold rolls forward rather
 * than failing either way, so the parsed date is compared back against what
 * was written — the year included, which is what distinguishes a real leap
 * day in a low year from one the calendar refuses.
 */
export function boundResolution(value: string): DateResolution | undefined {
  const resolution = dateShapeResolution(value);
  if (resolution === undefined) return undefined;

  const [year, month = '01', day = '01'] = value.split('-');
  const date = utcDate(Number(year), Number(month), Number(day));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }

  return resolution;
}

/**
 * The resolution a date string is written at, read from the string itself
 * rather than from the window it came from: the runtime's comparator parses
 * this string, and something that is no date at all has no resolution to
 * step.
 *
 * A date-shaped day the calendar does not hold is one of those. `2020-02-31`
 * neither fails to parse nor names February 31st — it rolls forward into
 * March — so the parsed date is compared back against what was written, the
 * same reading {@link boundResolution} applies to a declared bound.
 *
 * The two differ in what they read a low year with. Every caller of this one
 * hands it a value that already came from a window {@link boundResolution}
 * (through `requireCalendarBound`) held to a year no earlier than 0001 — the
 * picker's own floor — so there is no two-digit year left here for
 * `Date.UTC`'s remap to land on differently than {@link utcDate} would: for
 * every year from 0001 on, the two agree on whether a given month and day
 * roll forward. A plain `Date.UTC` is enough for that range, and this reader
 * does not itself repeat the year-equality check {@link boundResolution}
 * needs for a bound that has not yet been held to that floor.
 */
export function dateValueResolution(value: string): DateResolution | undefined {
  const resolution = dateShapeResolution(value);
  if (resolution === undefined) return undefined;

  const [year, month = '01', day = '01'] = value.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return undefined;
  }

  return resolution;
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
 *
 * At full resolution this is the same clamp the interview's own date fields
 * apply, so it is not stated twice: `dateWithinPickerRange` is where all three
 * derivations of a relative-date window read it from. The month and year
 * resolutions are generator-only — nothing outside this package steps a window
 * in months or years — so they are generalised here.
 */
export function offsetWithinOfferedDates(
  anchor: string,
  steps: number,
  resolution: DateResolution,
): string {
  if (resolution === 'full') return dateWithinPickerRange(anchor, steps);

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
