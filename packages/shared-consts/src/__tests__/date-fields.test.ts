import { describe, expect, it } from 'vitest';

import {
  DATE_PICKER_EARLIEST_DATE,
  DATE_PICKER_LATEST_DATE,
  datePickerWindows,
  dateWithinPickerRange,
  relativeDatePickerWindow,
} from '../date-fields.ts';

describe('dateWithinPickerRange', () => {
  it('leaves an offset that stays inside the calendar where it falls', () => {
    expect(dateWithinPickerRange('2026-07-27', 30)).toBe('2026-08-26');
    expect(dateWithinPickerRange('2026-07-27', -180)).toBe('2026-01-28');
    expect(dateWithinPickerRange('2026-07-27', 0)).toBe('2026-07-27');
  });

  it('counts across month lengths, leap days and century boundaries', () => {
    expect(dateWithinPickerRange('2024-02-28', 1)).toBe('2024-02-29');
    expect(dateWithinPickerRange('2100-02-28', 1)).toBe('2100-03-01');
    expect(dateWithinPickerRange('2024-12-31', 1)).toBe('2025-01-01');
  });

  // `Date.UTC` and the multi-argument `Date` constructor map a year of 0-99 into
  // 1900-1999. The native input offers those years and the protocol schema
  // admits them, so a window anchored there has to stay there.
  it('reads a low year literally rather than as 19xx', () => {
    expect(dateWithinPickerRange('0099-01-01', 30)).toBe('0099-01-31');
    expect(dateWithinPickerRange('0099-12-31', 1)).toBe('0100-01-01');
  });

  // Stepping forward from a ceiling in year 9999 overflows into a five-digit
  // year, which is not merely out of range: `matchesDatePattern` does not read
  // `10000-01-01` as a date, so a max validator compares the two strings
  // lexically instead — where `1` sorts below `9` and every four-digit-year date
  // in the window is rejected as too large.
  it.each([
    { anchor: '9999-12-31', days: 1 },
    { anchor: '9999-12-31', days: 365_250 },
    { anchor: '9999-01-01', days: 400 },
    { anchor: '9998-12-31', days: 400 },
  ])(
    'stops a step of $days from $anchor at the last date offered',
    ({ anchor, days }) => {
      expect(dateWithinPickerRange(anchor, days)).toBe(DATE_PICKER_LATEST_DATE);
    },
  );

  // The mirror at the other end: a `before` offset reaching past an early anchor
  // emits `0000-07-05`, a year the native input cannot hold, or `00-1-11-28`,
  // which is not a date at all and reparses as some other year-zero date.
  it.each([
    { anchor: '0001-01-01', days: -180 },
    { anchor: '0001-01-01', days: -400 },
    { anchor: '0001-06-15', days: -3650 },
    { anchor: '0002-01-01', days: -400 },
  ])(
    'stops a step of $days from $anchor at the first date offered',
    ({ anchor, days }) => {
      expect(dateWithinPickerRange(anchor, days)).toBe(
        DATE_PICKER_EARLIEST_DATE,
      );
    },
  );

  // The clamp cannot be a comparison against the date it produced, because an
  // overflowed date sorts *below* the ceiling it passed. This is the case that
  // separates a clamp in day-count space from a lexical one.
  it('does not mistake a five-digit year for a date before the ceiling', () => {
    const overflowed = '10000-01-01';

    expect(overflowed < DATE_PICKER_LATEST_DATE).toBe(true);
    expect(dateWithinPickerRange(DATE_PICKER_LATEST_DATE, 1)).toBe(
      DATE_PICKER_LATEST_DATE,
    );
  });

  // Stated here rather than read back from the module, so that moving either end
  // of the calendar is a decision this test makes visible rather than follows.
  it('holds every step between 0001-01-01 and 9999-12-31', () => {
    expect(DATE_PICKER_EARLIEST_DATE).toBe('0001-01-01');
    expect(DATE_PICKER_LATEST_DATE).toBe('9999-12-31');
    expect(dateWithinPickerRange('2026-07-27', 10_000_000)).toBe(
      DATE_PICKER_LATEST_DATE,
    );
    expect(dateWithinPickerRange('2026-07-27', -10_000_000)).toBe(
      DATE_PICKER_EARLIEST_DATE,
    );
  });

  // A bound coarser than the field's own resolution is refused upstream rather
  // than completed, and the arithmetic here has to leave it alone for that
  // refusal to be the thing anyone notices.
  it('hands back an anchor that names no day', () => {
    for (const partial of ['', '2024', '2024-02']) {
      expect(dateWithinPickerRange(partial, 30)).toBe(partial);
      expect(dateWithinPickerRange(partial, -30)).toBe(partial);
    }
  });
});

/**
 * The window every reader of a `RelativeDatePicker` has to derive: the field
 * that renders it, the interview that validates a submitted answer against it,
 * the generator that draws values inside it, and the protocol builder that
 * reports a rule operand outside it.
 *
 * The expected dates are written out rather than recomputed from
 * `dateWithinPickerRange`, so a clamp that is wrong in the same way everywhere
 * still fails here.
 */
describe('relativeDatePickerWindow', () => {
  it('counts the declared span either side of the declared anchor', () => {
    expect(
      relativeDatePickerWindow(
        { anchor: '2020-01-01', before: 30, after: 30 },
        '2026-07-27',
      ),
    ).toEqual({ min: '2019-12-02', max: '2020-01-31' });
  });

  it('falls back to today and the shared span, part by part', () => {
    // The control destructures its own defaults whether or not the record
    // exists, so an absent record and an empty one constrain identically.
    for (const parameters of [undefined, {}]) {
      expect(relativeDatePickerWindow(parameters, '2026-07-27')).toEqual({
        min: '2026-01-28',
        max: '2026-07-27',
      });
    }
    expect(relativeDatePickerWindow({ before: 30 }, '2026-07-27')).toEqual({
      min: '2026-06-27',
      max: '2026-07-27',
    });
    expect(
      relativeDatePickerWindow({ anchor: '2020-01-01' }, '2026-07-27'),
    ).toEqual({ min: '2019-07-05', max: '2020-01-01' });
  });

  it('ignores a parameter of the wrong kind rather than deriving from it', () => {
    // A protocol the schema has not validated can hold anything here, and a
    // window derived from `NaN` days is not a date any comparison can place.
    expect(
      relativeDatePickerWindow(
        { anchor: 2020, before: '30', after: null },
        '2026-07-27',
      ),
    ).toEqual({ min: '2026-01-28', max: '2026-07-27' });
  });

  it('holds both ends inside the calendar the picker can offer', () => {
    expect(
      relativeDatePickerWindow(
        { anchor: '9999-12-31', before: 364, after: 365_250 },
        '2026-07-27',
      ),
    ).toEqual({ min: '9999-01-01', max: '9999-12-31' });
    expect(
      relativeDatePickerWindow(
        { anchor: '0001-06-15', before: 3650, after: 30 },
        '2026-07-27',
      ),
    ).toEqual({ min: '0001-01-01', max: '0001-07-15' });
  });
});

/**
 * The window a `DatePicker` offers, which three packages have to agree on:
 * fresco-ui's `DatePickerField` renders it, the protocol builder reports a
 * rule operand outside the coarse pair, and protocol-validation's
 * contradiction analyser models the same rules against a fixed horizon.
 *
 * The expected dates are written out rather than recomputed here, so a
 * derivation that is wrong in the same way everywhere still fails.
 */
describe('datePickerWindows', () => {
  const TODAY = '2026-07-27';

  it('honours two authored bounds exactly', () => {
    expect(
      datePickerWindows({ min: '1800-05-06', max: '1810-11-12' }, TODAY),
    ).toEqual({
      native: { min: '1800-05-06', max: '1810-11-12' },
      coarse: { min: '1800-05-06', max: '1810-11-12' },
      hasAuthoredBound: true,
    });
  });

  it('completes a coarse bound the way the control reads one', () => {
    // A `YYYY` or `YYYY-MM` bound names no month or day, and both read as 1.
    expect(datePickerWindows({ min: '1800', max: '1810-06' }, TODAY)).toEqual({
      native: { min: '1800-01-01', max: '1810-06-01' },
      coarse: { min: '1800-01-01', max: '1810-06-01' },
      hasAuthoredBound: true,
    });
  });

  it('falls back to the default window when neither bound is authored', () => {
    // Reported for both pairs, and `hasAuthoredBound` false — which is what
    // lets a full-resolution input stay unbounded while the closed dropdowns
    // still take this window.
    for (const bounds of [{}, { min: '', max: '' }, { min: 'yesterday' }]) {
      expect(datePickerWindows(bounds, TODAY)).toEqual({
        native: { min: '1920-01-01', max: TODAY },
        coarse: { min: '1920-01-01', max: TODAY },
        hasAuthoredBound: false,
      });
    }
  });

  it('extends past an authored bound that already sits outside the default window', () => {
    // A max before 1920 would otherwise leave a floor above its own ceiling,
    // so the floor drops below it by the default window's span (2026 - 1920).
    expect(datePickerWindows({ max: '1800-06-15' }, TODAY)).toEqual({
      native: { min: '1694-01-01', max: '1800-06-15' },
      coarse: { min: '1694-01-01', max: '1800-06-15' },
      hasAuthoredBound: true,
    });
    // And the mirror: a min after today raises the ceiling by the same span,
    // over whole calendar years rather than the authored bound's own day.
    expect(datePickerWindows({ min: '2200-06-15' }, TODAY)).toEqual({
      native: { min: '2200-06-15', max: '2306-12-31' },
      coarse: { min: '2200-06-15', max: '2306-12-31' },
      hasAuthoredBound: true,
    });
  });

  it('clamps only the synthesized side, and only to what each control can offer', () => {
    // Extending below a max of 1000 reaches year 894, which is three digits to
    // a dropdown that stores `String(year)` and so names a year the schema's
    // coarse values can never carry — but the native input zero-pads, and
    // `0894-01-01` is a date its own lexical validator reads, so only the
    // coarse floor moves.
    expect(datePickerWindows({ max: '1000-01-01' }, TODAY)).toEqual({
      native: { min: '0894-01-01', max: '1000-01-01' },
      coarse: { min: '1000-01-01', max: '1000-01-01' },
      hasAuthoredBound: true,
    });
    // Far enough back and the native floor moves too: a year below 1 formats
    // with a leading `-`, which is not an HTML date string at all.
    expect(datePickerWindows({ max: '0050-01-01' }, TODAY)).toEqual({
      native: { min: '0001-01-01', max: '0050-01-01' },
      coarse: { min: '0050-01-01', max: '0050-01-01' },
      hasAuthoredBound: true,
    });
    // Both ceilings stop at the last four-digit year, because a five-digit one
    // sorts BELOW every date the field can hold.
    expect(datePickerWindows({ min: '9999-01-01' }, TODAY)).toEqual({
      native: { min: '9999-01-01', max: '9999-12-31' },
      coarse: { min: '9999-01-01', max: '9999-12-31' },
      hasAuthoredBound: true,
    });
  });

  it('moves the default ceiling with the clock', () => {
    expect(datePickerWindows({}, '2027-01-01').coarse).toEqual({
      min: '1920-01-01',
      max: '2027-01-01',
    });
  });
});
