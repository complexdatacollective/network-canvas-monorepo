import { describe, expect, it } from 'vitest';

import {
  DATE_PICKER_EARLIEST_DATE,
  DATE_PICKER_LATEST_DATE,
  dateWithinPickerRange,
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
