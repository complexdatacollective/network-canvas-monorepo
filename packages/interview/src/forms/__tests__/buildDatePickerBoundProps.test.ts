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

  // Both ends of a relative window are derived, and both can leave the calendar
  // from parameters the schema accepts. A five-digit year is not merely out of
  // range: `matchesDatePattern` does not read `10000-01-01` as a date, so this
  // max reaches the validator as a plain string and is compared lexically —
  // where a leading `1` sorts below every four-digit year, and the field then
  // rejects every value it can hold, including whatever a participant types.
  it.each([
    {
      end: 'ceiling',
      parameters: { anchor: '9999-12-31', before: 0, after: 1 },
      bounds: { min: '9999-12-31', max: '9999-12-31' },
    },
    {
      end: 'ceiling reached from further back',
      parameters: { anchor: '9998-12-31', before: 0, after: 400 },
      bounds: { min: '9998-12-31', max: '9999-12-31' },
    },
    {
      end: 'floor',
      parameters: { anchor: '0001-01-01', before: 180, after: 0 },
      bounds: { min: '0001-01-01', max: '0001-01-01' },
    },
    {
      // `before: 400` from year 1 derives `00-1-11-28`, which is not a date at
      // all rather than merely an early one.
      end: 'floor past year zero',
      parameters: { anchor: '0001-01-01', before: 400, after: 30 },
      bounds: { min: '0001-01-01', max: '0001-01-31' },
    },
  ])(
    'holds a relative window inside the calendar at the $end',
    ({ parameters, bounds }) => {
      expect(
        buildDatePickerBoundProps({
          component: 'RelativeDatePicker',
          parameters,
        }),
      ).toEqual(bounds);
    },
  );

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

    // The empty and absent records must produce the SAME window:
    // RelativeDatePickerField destructures its defaults whether or not a
    // `parameters` record exists, so the rendered control constrains the
    // participant either way and submission validation has to match it.
    it.each([
      ['an empty parameters record', {}],
      ['an absent parameters record', undefined],
    ] as const)(
      'defaults to today, 180 days before and 0 days after with %s',
      (_label, parameters) => {
        expect(
          buildDatePickerBoundProps({
            component: 'RelativeDatePicker',
            ...(parameters !== undefined ? { parameters } : {}),
          }),
        ).toEqual({ min: '2026-01-28', max: '2026-07-27' });
      },
    );
  });
});
