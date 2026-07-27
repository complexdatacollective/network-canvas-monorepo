import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDatePickerBoundProps } from '../buildDatePickerBoundProps';

describe('buildDatePickerBoundProps', () => {
  it('forwards DatePicker min/max verbatim', () => {
    expect(
      buildDatePickerBoundProps({
        component: 'DatePicker',
        parameters: { min: '2000-01-01', max: '2020-12-31' },
      }),
    ).toEqual({ min: '2000-01-01', max: '2020-12-31' });
  });

  it('returns no bounds for a DatePicker with no min/max parameters', () => {
    expect(
      buildDatePickerBoundProps({
        component: 'DatePicker',
        parameters: {},
      }),
    ).toEqual({});
  });

  it('returns no bounds for a DatePicker with no parameters object at all', () => {
    expect(buildDatePickerBoundProps({ component: 'DatePicker' })).toEqual({});
  });

  it('computes absolute bounds from an explicit RelativeDatePicker anchor/before/after', () => {
    expect(
      buildDatePickerBoundProps({
        component: 'RelativeDatePicker',
        parameters: { anchor: '2020-06-15', before: 10, after: 5 },
      }),
    ).toEqual({ min: '2020-06-05', max: '2020-06-20' });
  });

  describe('RelativeDatePicker defaults', () => {
    // RelativeDatePicker's default anchor is today, so freeze the system
    // clock rather than asserting against a live `new Date()` read — the
    // latter would make the expected/actual bounds depend on the day the
    // test happens to run.
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('defaults to today, 180 days before and 0 days after', () => {
      expect(
        buildDatePickerBoundProps({
          component: 'RelativeDatePicker',
          parameters: {},
        }),
      ).toEqual({ min: '2026-01-28', max: '2026-07-27' });
    });
  });
});
