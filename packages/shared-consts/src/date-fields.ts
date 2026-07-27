/**
 * Defaults the date input controls apply when a protocol declares no bounds of
 * its own.
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
