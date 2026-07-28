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
