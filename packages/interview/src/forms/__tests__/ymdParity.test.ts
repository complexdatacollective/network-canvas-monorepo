import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addDays as frescoAddDays,
  todayYmd as frescoTodayYmd,
} from '@codaco/fresco-ui/form/utils/ymd';
import {
  addDays as generatorAddDays,
  todayYmd as generatorTodayYmd,
} from '@codaco/protocol-utilities';
import {
  RELATIVE_DATE_PICKER_DEFAULT_AFTER,
  RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
} from '@codaco/shared-consts';

/**
 * fresco-ui renders and validates a date field's bounds with its own YYYY-MM-DD
 * arithmetic; protocol-utilities generates dates with a deliberate copy of it,
 * because that package must stay free of UI dependencies. Neither package can
 * see the other, so neither can notice the two drifting apart — and a drift of
 * a single day silently breaks the claim `syntheticDataConformance` makes, that
 * generated data satisfies what the interview validates.
 *
 * @codaco/interview depends on both, so this is the only place the two
 * implementations can be held to the same results. It guards behaviour rather
 * than source: the risk is a UTC/DST handling difference, which no shared
 * constant could catch.
 */
describe('fresco-ui and protocol-utilities date arithmetic agree', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const bases = [
    // Low years, which the native date input offers from 0001 and the protocol
    // schema admits at full resolution. `Date.UTC` maps a year of 0-99 into
    // 1900-1999, so either implementation reaching for it puts its dates an era
    // away from the other's.
    '0001-01-01',
    '0099-01-01',
    '0099-12-31',
    '0100-01-01',
    // The earliest date a picker offers, and the era boundaries either side.
    '1920-01-01',
    '1999-12-31',
    '2000-01-01',
    // Month ends of differing length, including the short one.
    '2023-01-31',
    '2023-02-28',
    '2023-04-30',
    // A leap year: the day before, the leap day itself, and the day after.
    '2024-02-28',
    '2024-02-29',
    '2024-03-01',
    // Year boundaries in both directions.
    '2024-12-31',
    '2025-01-01',
    '2026-07-27',
    // A century year that is not a leap year in the Gregorian calendar.
    '2100-02-28',
  ];

  const steps = [
    0,
    1,
    -1,
    // Either side of every month length.
    27,
    28,
    29,
    30,
    31,
    -31,
    // The RelativeDatePicker defaults, which is the span that actually matters.
    RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
    -RELATIVE_DATE_PICKER_DEFAULT_BEFORE,
    RELATIVE_DATE_PICKER_DEFAULT_AFTER,
    // Whole years, leap years, and multi-year jumps in both directions.
    365,
    -365,
    366,
    -366,
    3650,
    -3650,
    36_525,
    -36_525,
  ];

  it.each(bases)('agrees on every step from %s', (base) => {
    // Compared as whole labelled lists so a failure names the step that drifted
    // rather than stopping at the first one.
    const generated = steps.map(
      (days) => `${days}: ${generatorAddDays(base, days)}`,
    );
    const rendered = steps.map(
      (days) => `${days}: ${frescoAddDays(base, days)}`,
    );

    expect(generated).toEqual(rendered);
  });

  it('agrees across every day of a leap year and the year after it', () => {
    let frescoCursor = '2024-01-01';
    let generatorCursor = '2024-01-01';

    for (let day = 0; day < 731; day++) {
      frescoCursor = frescoAddDays(frescoCursor, 1);
      generatorCursor = generatorAddDays(generatorCursor, 1);
      expect(generatorCursor).toBe(frescoCursor);
    }

    expect(frescoCursor).toBe('2026-01-01');
  });

  it('agrees on a malformed bound rather than inventing a date', () => {
    for (const malformed of ['', 'not-a-date', '2024', '2024-02']) {
      expect(generatorAddDays(malformed, 1)).toBe(frescoAddDays(malformed, 1));
    }
  });

  // Both implementations read the clock, so comparing two live reads would fail
  // whenever they straddle midnight. The clock is pinned instead, at instants
  // chosen to separate a UTC date from a local one: what is being checked is
  // that both answer with the same calendar, not that both ran in the same
  // millisecond.
  it.each([
    ['1920-01-01T00:00:00.000Z', '1920-01-01'],
    ['2024-02-29T12:00:00.000Z', '2024-02-29'],
    // Late enough in the day that a positive UTC offset has already rolled over.
    ['2024-12-31T23:59:59.999Z', '2024-12-31'],
    // Early enough that a negative UTC offset is still on the previous day.
    ['2025-01-01T00:00:00.001Z', '2025-01-01'],
    ['2026-07-27T08:30:00.000Z', '2026-07-27'],
  ])('reads %s as the same day in both packages', (instant, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(instant);

    expect(generatorTodayYmd()).toBe(frescoTodayYmd());
    expect(frescoTodayYmd()).toBe(expected);
  });

  it('derives the same default RelativeDatePicker window from today', () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-07-27T00:00:00.000Z');

    const frescoToday = frescoTodayYmd();
    const generatorToday = generatorTodayYmd();

    expect([
      generatorAddDays(generatorToday, -RELATIVE_DATE_PICKER_DEFAULT_BEFORE),
      generatorAddDays(generatorToday, RELATIVE_DATE_PICKER_DEFAULT_AFTER),
    ]).toEqual([
      frescoAddDays(frescoToday, -RELATIVE_DATE_PICKER_DEFAULT_BEFORE),
      frescoAddDays(frescoToday, RELATIVE_DATE_PICKER_DEFAULT_AFTER),
    ]);
  });
});
