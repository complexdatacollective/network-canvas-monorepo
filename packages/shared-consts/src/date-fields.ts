/**
 * What the date input controls do with the bounds a protocol leaves to them:
 * the defaults they apply when it declares none, the dates they can represent
 * at all, and the arithmetic that holds a derived bound inside those.
 *
 * These live here rather than in the components that render them because two
 * other packages have to *predict* them: `@codaco/interview` derives the hard
 * min/max validators a submitted date is checked against, and
 * `@codaco/protocol-utilities` draws synthetic dates that must land inside the
 * window the interview will accept. A copy in each package looks harmless and
 * is not — every package tests only its own copy, so a default changed in one
 * place leaves the others silently predicting a window that no longer exists.
 * `@codaco/shared-consts` is the one package all three already depend on, and
 * protocol-utilities must stay free of UI dependencies.
 */

/**
 * The earliest date a `DatePicker` offers when the protocol declares no
 * minimum. Written in the same `YYYY-MM-DD` form a protocol writes a bound in
 * and the runtime compares bounds with, so consumers needing coarser
 * resolutions truncate it and the one consumer needing calendar parts parses
 * it. A value before this passes every validator and still cannot be selected.
 */
export const DATE_PICKER_DEFAULT_MIN = '1920-01-01';

/** How many days before its anchor a `RelativeDatePicker` reaches by default. */
export const RELATIVE_DATE_PICKER_DEFAULT_BEFORE = 180;

/** How many days after its anchor a `RelativeDatePicker` reaches by default. */
export const RELATIVE_DATE_PICKER_DEFAULT_AFTER = 0;

/**
 * The earliest date a full-resolution date field can represent. It renders a
 * native `<input type="date">`, whose calendar starts at year 0001, and the
 * protocol schema admits years 0001-0999 there deliberately.
 */
export const DATE_PICKER_EARLIEST_DATE = '0001-01-01';

/**
 * The latest date the same field can represent.
 *
 * Four digits is the whole of the rule, and every parser this ecosystem shares
 * states it: fresco-ui's `matchesDatePattern`
 * (`/^\d{4}-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)?$/`), `DatePickerField`'s
 * `ymdPattern`, and the protocol schema's `isIsoDate`.
 *
 * A five-digit year is worse than out of range: it is not read as a date at
 * all. `matchesDatePattern` refuses `10000-01-01`, so a field's max validator
 * falls back to comparing the two strings lexically — where a leading `1` sorts
 * every four-digit-year date *above* the ceiling. A window ceilinged there
 * rejects every value it can hold, whether a participant typed it or the
 * generator drew it.
 */
export const DATE_PICKER_LATEST_DATE = '9999-12-31';

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Midnight UTC on a date whose year is read literally, so that arithmetic is
 * stable regardless of the runtime timezone — the fields compare these strings
 * lexically, and any drift would show up as off-by-one-day validation failures
 * near a DST boundary.
 *
 * `Date.UTC` — like the multi-argument `Date` constructor — maps a year of 0-99
 * into 1900-1999, so `0099-01-01` would be built as 1999-01-01 and every date
 * derived from it would land an era away from the window a protocol declared.
 * `setUTCFullYear` carries no two-digit-year special case.
 */
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function addDays(ymd: string, days: number): string {
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

/** Missing components default the way a partial bound is read elsewhere. */
function daysBetween(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 1, fromDay = 1] = from
    .split('-')
    .map(Number);
  const [toYear = 0, toMonth = 1, toDay = 1] = to.split('-').map(Number);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (utcDate(toYear, toMonth, toDay).getTime() -
      utcDate(fromYear, fromMonth, fromDay).getTime()) /
      msPerDay,
  );
}

/**
 * The date `days` from `anchor`, held between the earliest and latest dates a
 * date field can represent.
 *
 * A `RelativeDatePicker` derives both ends of its window this way, and the same
 * window is derived three times over — by the field that renders it, by the
 * interview's submission validators, and by the generator that has to draw
 * values landing inside it. None of those three can see the others, so the rule
 * is stated once, here, rather than three times.
 *
 * The *offset* is clamped, not the date it produces, because a date outside the
 * range is not a string any comparison can place. Stepping past year 9999
 * writes a five-digit year (`10000-01-01`) that sorts *below* every four-digit
 * one, so a ceiling that overflowed cannot be recognised after the fact: it
 * reads as an early date, and a max validator comparing lexically then rejects
 * every value the field can hold. Stepping before year 0001 writes `0000-07-05`,
 * a year the input cannot offer, or `00-1-11-28`, which is not a date at all and
 * reparses as some other one. Clamping in day-count space needs neither shape to
 * be recognised.
 *
 * An anchor that is not a full date is handed straight back, the way `addDays`
 * hands one back: there is no day to advance, so a window derived from a partial
 * anchor collapses onto it rather than inventing the precision nobody wrote.
 */
export function dateWithinPickerRange(anchor: string, days: number): string {
  const earliest = daysBetween(anchor, DATE_PICKER_EARLIEST_DATE);
  const latest = daysBetween(anchor, DATE_PICKER_LATEST_DATE);
  return addDays(anchor, Math.max(earliest, Math.min(days, latest)));
}

/** The parameters a `RelativeDatePicker` derives its window from. */
export type RelativeDatePickerParameters = Readonly<{
  anchor?: unknown;
  before?: unknown;
  after?: unknown;
}>;

/** The two dates a `RelativeDatePicker` holds an answer between. */
export type RelativeDatePickerWindow = Readonly<{ min: string; max: string }>;

/**
 * The window a `RelativeDatePicker` offers, from the parameters a protocol
 * declares and the day the reader is asking on.
 *
 * A relative picker names no `min`/`max`: it names an anchor and a span either
 * side of it, and EVERY reader of one has to turn that into the same two
 * dates. `@codaco/interview` validates a submitted answer against them
 * (`buildDatePickerBoundProps`) and `@codaco/protocol-builder` reports a rule
 * operand outside them, so the derivation lives here — beside the clamp and
 * the defaults it is built from — rather than once per reader.
 *
 * Every part of it defaults, because the control does: an absent `parameters`
 * record, an absent anchor and absent offsets all leave a
 * `RelativeDatePickerField` constraining the participant exactly as an empty
 * one does. `today` is passed in rather than read, because the clock belongs
 * to the caller — fresco-ui and protocol-utilities each have their own
 * `todayYmd`, and this package must stay free of both.
 *
 * `RelativeDatePickerField` and `@codaco/protocol-utilities`' generator derive
 * the same window from the same clamp without going through here — the field
 * has already applied its own prop defaults by the time it computes, and the
 * generator REFUSES a coarse anchor rather than defaulting one. All four
 * answers are held to one set of dates by
 * `@codaco/interview`'s `relativeDateWindowParity.test.tsx`.
 */
export function relativeDatePickerWindow(
  parameters: RelativeDatePickerParameters | undefined,
  today: string,
): RelativeDatePickerWindow {
  const anchor =
    typeof parameters?.anchor === 'string' ? parameters.anchor : today;
  const before =
    typeof parameters?.before === 'number'
      ? parameters.before
      : RELATIVE_DATE_PICKER_DEFAULT_BEFORE;
  const after =
    typeof parameters?.after === 'number'
      ? parameters.after
      : RELATIVE_DATE_PICKER_DEFAULT_AFTER;
  return {
    min: dateWithinPickerRange(anchor, -before),
    max: dateWithinPickerRange(anchor, after),
  };
}

/** The `min`/`max` a protocol declares on a `DatePicker`, as it declares them. */
export type DatePickerBounds = Readonly<{ min?: string; max?: string }>;

/** Two dates a date control holds an answer between, at full resolution. */
export type DatePickerWindow = Readonly<{ min: string; max: string }>;

/**
 * The windows a `DatePicker` resolves its declared bounds to.
 *
 * `native` is what a full-resolution `<input type="date">` is given for its
 * `min`/`max` attributes; `coarse` is what a month or year picker builds its
 * dropdown lists from. They differ only in where a SYNTHESIZED edge is
 * clamped, because the two controls can represent different things — the
 * native input zero-pads any year from 0001, while the dropdowns store
 * `String(year)` unpadded and so can only round-trip a four-digit one.
 * `hasAuthoredBound` is what tells a fully unbounded full-resolution picker
 * (which must stay unbounded) from a bounded one.
 */
export type DatePickerWindows = Readonly<{
  native: DatePickerWindow;
  coarse: DatePickerWindow;
  hasAuthoredBound: boolean;
}>;

type PickerYmd = Readonly<{ year: number; month: number; day: number }>;

/**
 * A declared bound, read the way the control reads one.
 *
 * `YYYY[-MM[-DD]]`, with a missing month or day defaulting to 1 so a coarse
 * bound still resolves to a date. Anything else is not a bound the control can
 * honour, and is ABSENT to it: a string this rejects gets the same synthesized
 * edge a missing one does, so every reader has to reject it identically or
 * they will disagree about whether a window was authored at all.
 */
const PICKER_YMD_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function parsePickerYmd(value: string | undefined): PickerYmd | null {
  if (value === undefined || value === '') return null;
  const match = PICKER_YMD_PATTERN.exec(value);
  if (!match?.[1]) return null;
  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function requirePickerYmd(value: string): PickerYmd {
  const parsed = parsePickerYmd(value);
  if (!parsed) {
    throw new Error(`Expected a YYYY-MM-DD date bound, received "${value}".`);
  }
  return parsed;
}

function comparePickerYmd(a: PickerYmd, b: PickerYmd): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

const formatPickerYmd = ({ year, month, day }: PickerYmd): string =>
  formatYmd(year, month, day);

const DEFAULT_WINDOW_MIN: PickerYmd = requirePickerYmd(DATE_PICKER_DEFAULT_MIN);

/**
 * The years the coarse year/month dropdowns can round-trip. They store
 * `String(year)` with no zero-padding, so the schema's `YYYY`/`YYYY-MM` values
 * can only carry a four-digit year.
 */
const COARSE_MIN_YEAR = 1000;
const COARSE_MAX_YEAR = Number(DATE_PICKER_LATEST_DATE.slice(0, 4));

/**
 * The years the full-resolution native input can offer that the form's own
 * validators can also accept. `formatYmd` zero-pads, so the input can
 * represent any magnitude — but a year below 1 formats with a leading `-`
 * (which is not a valid HTML date string, so the browser drops the attribute)
 * and a five-digit year sorts BELOW every four-digit one in the lexical
 * comparison a min/max validator falls back to.
 */
const NATIVE_MIN_YEAR = Number(DATE_PICKER_EARLIEST_DATE.slice(0, 4));
const NATIVE_MAX_YEAR = COARSE_MAX_YEAR;

/**
 * The two windows a `DatePicker` resolves `parameters.min`/`parameters.max`
 * to, on the day the reader is asking.
 *
 * A `DatePicker` with BOTH bounds authored honours both exactly. With one
 * authored, the missing side falls back to the default window's edge — 1920-01-01
 * below, today above — unless the authored bound is already past that edge, in
 * which case the missing side extends beyond it by the default window's own
 * span (`today.year - 1920`) over whole calendar years, so the picker still
 * offers a range rather than pinning the variable to a single value. With
 * NEITHER authored the plain default window applies, and `hasAuthoredBound` is
 * false — which is what lets a full-resolution input stay genuinely unbounded
 * while the month and year dropdowns, which are closed lists and cannot offer
 * anything outside a finite range, still get one.
 *
 * Lives here, beside the defaults and the clamp it is built from, because
 * three packages have to reach the same answer: fresco-ui's `DatePickerField`
 * renders it, `@codaco/protocol-builder` reports a rule operand outside the
 * coarse window as a comparison no participant could satisfy, and
 * `@codaco/protocol-validation`'s contradiction analyser models the same
 * derivation without a clock (deliberately: protocol validity must not depend
 * on when validation runs, so it substitutes a fixed horizon for `today` and
 * cannot call this).
 *
 * `today` is passed in rather than read, for the same reason
 * `relativeDatePickerWindow` takes it: the clock belongs to the caller.
 */
export function datePickerWindows(
  bounds: DatePickerBounds,
  today: string,
): DatePickerWindows {
  const authoredMin = parsePickerYmd(bounds.min);
  const authoredMax = parsePickerYmd(bounds.max);
  const now = requirePickerYmd(today);
  const defaultWindowSpanYears = now.year - DEFAULT_WINDOW_MIN.year;

  const resolvedMin: PickerYmd =
    authoredMin ??
    (authoredMax && comparePickerYmd(authoredMax, DEFAULT_WINDOW_MIN) < 0
      ? { year: authoredMax.year - defaultWindowSpanYears, month: 1, day: 1 }
      : DEFAULT_WINDOW_MIN);
  const resolvedMax: PickerYmd =
    authoredMax ??
    (authoredMin && comparePickerYmd(authoredMin, now) > 0
      ? { year: authoredMin.year + defaultWindowSpanYears, month: 12, day: 31 }
      : now);

  // Only the synthesized side is clamped. An authored bound is left exactly as
  // authored — validating one is the schema's job — and each clamp is bounded
  // by the authored opposite side so it can never invert the range.
  const clampedMin = (floorYear: number): PickerYmd =>
    authoredMin === null && resolvedMin.year < floorYear
      ? { year: Math.min(floorYear, resolvedMax.year), month: 1, day: 1 }
      : resolvedMin;
  const clampedMax = (ceilingYear: number): PickerYmd =>
    authoredMax === null && resolvedMax.year > ceilingYear
      ? { year: Math.max(ceilingYear, resolvedMin.year), month: 12, day: 31 }
      : resolvedMax;

  return {
    native: {
      min: formatPickerYmd(clampedMin(NATIVE_MIN_YEAR)),
      max: formatPickerYmd(clampedMax(NATIVE_MAX_YEAR)),
    },
    coarse: {
      min: formatPickerYmd(clampedMin(COARSE_MIN_YEAR)),
      max: formatPickerYmd(clampedMax(COARSE_MAX_YEAR)),
    },
    hasAuthoredBound: authoredMin !== null || authoredMax !== null,
  };
}
