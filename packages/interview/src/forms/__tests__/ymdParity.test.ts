import { afterEach, describe, expect, it, vi } from 'vitest';

import { todayYmd as frescoTodayYmd } from '@codaco/fresco-ui/form/utils/ymd';
import { todayYmd as generatorTodayYmd } from '@codaco/protocol-utilities';

/**
 * fresco-ui and protocol-utilities each read the system clock through their
 * own `todayYmd`, because protocol-utilities must stay free of UI
 * dependencies and so cannot import fresco-ui's copy. Both feed straight into
 * a `RelativeDatePicker` window left with no explicit anchor:
 * `RelativeDatePickerField` and `buildDatePickerBoundProps` default an
 * undeclared `anchor` to fresco-ui's `todayYmd()`, and the generator's
 * `config.today` defaults to its own `todayYmd()`
 * (`generateNetwork/config.ts`) whenever a caller doesn't pin it.
 *
 * If the two ever disagreed — one reading local time instead of UTC, say, or
 * missing a UTC-midnight rollover the other caught — the generator would
 * anchor a window on a different day than the one the field renders and the
 * interview validates against, and every date it drew could land a day
 * outside that window.
 *
 * @codaco/interview depends on both packages, so it is the only place the two
 * clock reads can be compared directly. The window *arithmetic* itself isn't
 * duplicated for @codaco/interview to hold together any more — both packages
 * derive it from the same `dateWithinPickerRange` in `@codaco/shared-consts`
 * — and that shared derivation is exercised end to end, generator draws
 * included, by `relativeDateWindowParity.test.tsx`.
 */
describe('fresco-ui and protocol-utilities agree on what day it is', () => {
  afterEach(() => {
    vi.useRealTimers();
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
});
