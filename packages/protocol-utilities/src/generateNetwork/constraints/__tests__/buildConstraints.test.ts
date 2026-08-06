import { describe, expect, it } from 'vitest';

import {
  type Stage,
  type StructuralCodebook,
  VARIABLE_REFERENCE_VALIDATIONS,
} from '@codaco/protocol-validation';

import { ValueGenerator } from '../../../ValueGenerator';
import type { FeasibilityConfig } from '../../config';
import {
  buildEntityConstraints,
  buildVariableConstraints,
} from '../buildConstraints';
import {
  addSteps,
  EARLIEST_OFFERED_DATE,
  LATEST_OFFERED_DATE,
  stepsBetween,
} from '../dateWindow';
import { analyseFeasibility } from '../feasibility';
import { valueSpaceSize } from '../valueSpace';

const TODAY = '2026-07-27';

describe('buildVariableConstraints', () => {
  it('reads single-variable rules from validation', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Nickname',
        type: 'text',
        validation: { required: true, minLength: 24, maxLength: 24 },
      },
      TODAY,
    );

    expect(result.required).toBe(true);
    expect(result.minLength).toBe(24);
    expect(result.maxLength).toBe(24);
    expect(result.unique).toBe(false);
  });

  it('reads cross-variable references', () => {
    const result = buildVariableConstraints(
      {
        id: 'v2',
        name: 'Confirm',
        type: 'text',
        validation: { sameAs: 'v1', differentFrom: 'v3' },
      },
      TODAY,
    );

    expect(result.sameAs).toBe('v1');
    expect(result.differentFrom).toBe('v3');
  });

  it('defaults required and unique to false when validation is absent', () => {
    const result = buildVariableConstraints(
      { id: 'v1', name: 'Name', type: 'text' },
      TODAY,
    );

    expect(result.required).toBe(false);
    expect(result.unique).toBe(false);
    expect(result.dateWindow).toBeUndefined();
  });

  it('normalises DatePicker parameters into a date window', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'month', min: '2020-01-01', max: '2024-06-30' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'month',
      min: '2020-01',
      max: '2024-06',
    });
  });

  it('defaults DatePicker resolution to full', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({ resolution: 'full', max: TODAY });
  });

  // DatePicker's field offers no date after today when the protocol declares no
  // maximum, and the draw already ceilings an open window there. Closing it
  // here is what lets `valueSpaceSize` count the window without reading a
  // clock of its own, which a seeded run has to reproduce across midnight.
  it.each([
    { type: 'year', max: '2026' },
    { type: 'month', max: '2026-07' },
    { type: 'full', max: TODAY },
  ])(
    'closes an open $type window at the last date the picker offers',
    ({ type, max }) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type, min: '2000-01-01' },
        },
        TODAY,
      );

      expect(result.dateWindow?.max).toBe(max);
    },
  );

  it('extends a coarse missing ceiling from a floor later than today', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Due',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '2030-01-01' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'year',
      min: '2030',
      max: '2136',
    });
  });

  it.each([
    {
      type: 'year',
      parameters: {},
      expected: { resolution: 'year', min: '1920', max: '2026' },
    },
    {
      type: 'year',
      parameters: { max: '1800' },
      expected: { resolution: 'year', min: '1694', max: '1800' },
    },
    {
      type: 'month',
      parameters: { max: '1800' },
      expected: { resolution: 'month', min: '1694-01', max: '1800-01' },
    },
    {
      type: 'month',
      parameters: { min: '2030' },
      expected: { resolution: 'month', min: '2030-01', max: '2136-12' },
    },
  ])(
    'matches the today-dependent $type dropdown window for $parameters',
    ({ type, parameters, expected }) => {
      expect(
        buildVariableConstraints(
          {
            id: 'v1',
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type, ...parameters },
          },
          TODAY,
        ).dateWindow,
      ).toEqual(expected);
    },
  );

  it('keeps every exact coarse window through 2120 inside the horizon model', () => {
    const fixtures = [
      {
        type: 'year' as const,
        parameters: {},
        horizon: { min: '1920', max: '2120' },
      },
      {
        type: 'year' as const,
        parameters: { max: '1800' },
        horizon: { min: '1600', max: '1800' },
      },
      {
        type: 'year' as const,
        parameters: { min: '3000' },
        horizon: { min: '3000', max: '3200' },
      },
      {
        type: 'year' as const,
        parameters: { max: '1100' },
        horizon: { min: '1000', max: '1100' },
      },
      {
        type: 'year' as const,
        parameters: { min: '9900' },
        horizon: { min: '9900', max: '9999' },
      },
      {
        type: 'month' as const,
        parameters: { max: '2020' },
        horizon: { min: '1920-01', max: '2020-01' },
      },
    ];
    const violations: Array<{
      today: string;
      horizon: { min: string; max: string };
      window: { min?: string; max?: string } | undefined;
    }> = [];

    for (let year = 2026; year <= 2120; year++) {
      for (let month = 1; month <= 12; month++) {
        const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= days; day++) {
          const today =
            `${String(year).padStart(4, '0')}-` +
            `${String(month).padStart(2, '0')}-` +
            String(day).padStart(2, '0');
          for (const fixture of fixtures) {
            const window = buildVariableConstraints(
              {
                id: 'v1',
                name: 'Born',
                type: 'datetime',
                component: 'DatePicker',
                parameters: {
                  type: fixture.type,
                  ...fixture.parameters,
                },
              },
              today,
            ).dateWindow;
            if (
              (window?.min ?? '') < fixture.horizon.min ||
              (window?.max ?? '') > fixture.horizon.max
            ) {
              violations.push({
                today,
                horizon: fixture.horizon,
                window,
              });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps every exact relative window through 2120 inside the symbolic model', () => {
    const fixtures = [
      { parameters: {}, model: { min: -180, max: 0 } },
      { parameters: { before: 30, after: 10 }, model: { min: -30, max: 10 } },
    ];
    const violations: Array<{
      today: string;
      model: { min: number; max: number };
      runtimeMin: number;
      runtimeMax: number;
    }> = [];

    for (let year = 2026; year <= 2120; year++) {
      for (let month = 1; month <= 12; month++) {
        const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= days; day++) {
          const today =
            `${String(year).padStart(4, '0')}-` +
            `${String(month).padStart(2, '0')}-` +
            String(day).padStart(2, '0');
          for (const fixture of fixtures) {
            const window = buildVariableConstraints(
              {
                id: 'v1',
                name: 'Seen',
                type: 'datetime',
                component: 'RelativeDatePicker',
                parameters: fixture.parameters,
              },
              today,
            ).dateWindow;
            const runtimeMin =
              window?.min === undefined
                ? Number.NEGATIVE_INFINITY
                : -stepsBetween(window.min, today, 'full');
            const runtimeMax =
              window?.max === undefined
                ? Number.POSITIVE_INFINITY
                : stepsBetween(today, window.max, 'full');
            if (
              runtimeMin < fixture.model.min ||
              runtimeMax > fixture.model.max
            ) {
              violations.push({
                today,
                model: fixture.model,
                runtimeMin,
                runtimeMax,
              });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  // The full resolution is the one control that does not stop at today: a
  // native `<input type="date">` is handed the declared bound verbatim, so with
  // no maximum declared it carries no `max` attribute, and the interview
  // validates none either. Every date from the floor onward is one a
  // participant can submit, so the floor raises the ceiling to meet it rather
  // than leaving an empty range that refuses the field. It rises exactly that
  // far: the draw ceilings an open window at today too, so the floor is the
  // only date it can write.
  it('raises a full-date ceiling to a floor declared later than today', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Due',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2030-01-01' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2030-01-01',
      max: '2030-01-01',
    });
  });

  // The variable schema accepts an arbitrary string for these parameters, so an
  // imported protocol can carry a bound that names no date. Left in the window
  // it reaches `stepsBetween` as `NaN`, which counts as `NaN` values — read as
  // satisfied by every feasibility comparison — and draws as `0NaN-NaN-NaN`.
  it.each([
    { parameter: 'min', value: 'not-a-date' },
    { parameter: 'max', value: 'not-a-date' },
    // Date-shaped, but no such day: `Date.UTC` rolls it forward into February
    // rather than refusing it.
    { parameter: 'max', value: '2020-01-32' },
    { parameter: 'min', value: '2020-13-01' },
  ])('refuses a $parameter of "$value" by name', ({ parameter, value }) => {
    expect(() =>
      buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full', [parameter]: value },
        },
        TODAY,
      ),
    ).toThrow(
      `Date variable "Born" (v1) declares ${parameter} "${value}", which is not a calendar date.`,
    );
  });

  it('refuses a RelativeDatePicker anchor that names no date', () => {
    expect(() =>
      buildVariableConstraints(
        {
          id: 'v1',
          name: 'Last seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: 'not-a-date', before: 30, after: 5 },
        },
        TODAY,
      ),
    ).toThrow('declares anchor "not-a-date"');
  });

  // The variable schema puts no shape on these parameters at all
  // (`min: z.string().optional()`, no refinement over it and no migration that
  // touches it), so a schema-valid protocol can write one coarser than the date
  // its picker collects. The interview enforces such a bound by truncating both
  // sides to the shorter of the two before comparing (fresco-ui's
  // `compareDateStrings`), which makes a coarse floor the first date it admits
  // and a coarse ceiling the last. Completed to those rather than refused: the
  // field collects dates perfectly well today.
  it.each([
    { parameter: 'min', value: '2020', expected: '2020-01-01' },
    { parameter: 'max', value: '2020', expected: '2020-12-31' },
    { parameter: 'min', value: '2020-06', expected: '2020-06-01' },
    { parameter: 'max', value: '2020-06', expected: '2020-06-30' },
    // The ceiling takes the day the calendar gives that month, not a fixed 31.
    { parameter: 'max', value: '2020-02', expected: '2020-02-29' },
    { parameter: 'max', value: '2021-02', expected: '2021-02-28' },
  ])(
    'completes a full-picker $parameter of "$value" to $expected',
    ({ parameter, value, expected }) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full', [parameter]: value },
        },
        TODAY,
      );

      expect(result.dateWindow?.[parameter === 'min' ? 'min' : 'max']).toBe(
        expected,
      );
    },
  );

  // A month picker is a `<select>` whose options `DatePickerField` builds by
  // running each bound through `ymdPattern`, which defaults every missing
  // component to 1 at both ends — so a coarse ceiling caps that year's month
  // list at January. A later month would validate and still be one the control
  // never offered, so this resolution takes the control's reading.
  it.each([
    { parameter: 'min', value: '2020', expected: '2020-01' },
    { parameter: 'max', value: '2020', expected: '2020-01' },
  ])(
    'completes a month-picker $parameter of "$value" to $expected',
    ({ parameter, value, expected }) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', [parameter]: value },
        },
        TODAY,
      );

      expect(result.dateWindow?.[parameter === 'min' ? 'min' : 'max']).toBe(
        expected,
      );
    },
  );

  // The two ends are completed independently, so a protocol may write them at
  // different resolutions from each other as well as from the picker.
  it('completes a min and a max written at different resolutions', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full', min: '2020', max: '2022-06' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2020-01-01',
      max: '2022-06-30',
    });
  });

  // The count and the draw both read this one descriptor, so completing the
  // window is what keeps them describing the same thing. Left incomplete, the
  // draw's `addDays` found no day to advance and handed the literal `"2020"`
  // back for every offset in the window, while the count reported the days it
  // was never going to walk.
  it('counts and draws the same completed window', () => {
    const entry = {
      id: 'v1',
      name: 'Born',
      type: 'datetime' as const,
      component: 'DatePicker' as const,
      parameters: { type: 'full', min: '2020', max: '2020-02' },
    };
    const constraints = buildVariableConstraints(entry, TODAY);
    const window = constraints.dateWindow;

    // 2020-01-01 to 2020-02-29 inclusive.
    expect(valueSpaceSize({ entry, constraints }, 1000)).toBe(60);

    const generator = new ValueGenerator(1, TODAY);
    const drawn = new Set<string>();
    for (let index = 0; index < 60; index++) {
      const value = generator.generateConstrained(
        { entry, constraints },
        index,
      );
      expect(typeof value).toBe('string');
      if (typeof value === 'string') drawn.add(value);
    }

    for (const value of drawn) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value >= (window?.min ?? '')).toBe(true);
      expect(value <= (window?.max ?? '')).toBe(true);
    }
  });

  // Its offsets are counted in days from the anchor, so a coarser one leaves
  // `addDays` nothing to advance and collapses the window onto the anchor.
  // Refused rather than completed, because this is the one date parameter the
  // schema also refuses: `dateTimeRelativeDatePickerSchema`'s `superRefine`
  // holds the anchor to `isIsoDate`, whose regex admits only `YYYY-MM-DD`.
  it('refuses a RelativeDatePicker anchor coarser than a full date', () => {
    expect(() =>
      buildVariableConstraints(
        {
          id: 'v1',
          name: 'Last seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2020-06', before: 30, after: 5 },
        },
        TODAY,
      ),
    ).toThrow(
      'declares anchor "2020-06", which is coarser than the date its picker collects.',
    );
  });

  // A full-resolution field is a native `<input type="date">`, whose dates
  // start at year 0001, and the protocol schema admits 0001-0999 there
  // deliberately. The window kept the bound verbatim already; what it reached
  // the draw as was another matter, because `Date.UTC` maps a year of 0-99 into
  // 1900-1999 and `addDays` emitted `1999-01-01` — outside the declared window,
  // and not the date the picker offers.
  it.each([
    { min: '0099-01-01', max: '0099-12-31' },
    { min: '0001-01-01', max: '0001-01-02' },
    { min: '0099-12-31', max: '0100-01-01' },
  ])(
    'keeps a full-date window in year $min and draws inside it',
    (declared) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full', ...declared },
        },
        TODAY,
      );

      expect(result.dateWindow).toEqual({ resolution: 'full', ...declared });

      // The draw's own arithmetic, held to the window it was handed: every offset
      // it can take has to land back inside it.
      const window = result.dateWindow;
      if (window?.min === undefined || window.max === undefined) {
        throw new Error('expected a closed window');
      }
      const span = stepsBetween(window.min, window.max, 'full');
      const drawn = [0, span].map((offset) =>
        addSteps(window.min ?? '', offset, 'full'),
      );

      expect(drawn).toEqual([declared.min, declared.max]);
    },
  );

  // A real, round-tripping ISO date — JavaScript's calendar has a year 0 — but
  // the native date input's earliest is 0001-01-01, so nothing in the window
  // could be selected or displayed. The protocol schema refuses it for the same
  // reason.
  it.each([
    { parameter: 'min', value: '0000-01-01' },
    { parameter: 'max', value: '0000-12-31' },
  ])('refuses a full-date $parameter in year zero', ({ parameter, value }) => {
    expect(() =>
      buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'full', [parameter]: value },
        },
        TODAY,
      ),
    ).toThrow(
      `Date variable "Born" (v1) declares ${parameter} "${value}", whose year is earlier than its picker can offer. ` +
        'Synthetic data generation needs a year of 0001 or later.',
    );
  });

  // The year and month pickers are a `<select>` whose options stringify each
  // year unpadded, so a bound of `0099` lists as `99` and the padded value the
  // draw writes matches no option at all. The protocol schema floors these two
  // resolutions at year 1000 for the same reason; only the full-date input
  // renders a low year.
  it.each([
    { parameter: 'min', value: '0099', type: 'year' },
    { parameter: 'max', value: '0999', type: 'year' },
    { parameter: 'min', value: '0099-03', type: 'month' },
    { parameter: 'min', value: '0800-01', type: 'month' },
  ])(
    'refuses a $type-picker $parameter of "$value"',
    ({ parameter, value, type }) => {
      expect(() =>
        buildVariableConstraints(
          {
            id: 'v1',
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type, [parameter]: value },
          },
          TODAY,
        ),
      ).toThrow(
        `Date variable "Born" (v1) declares ${parameter} "${value}", whose year is earlier than its picker can offer. ` +
          'Synthetic data generation needs a year of 1000 or later.',
      );
    },
  );

  // Counted in days from the anchor, so the anchor is a full date and takes the
  // full-date floor with it.
  it('anchors a RelativeDatePicker in a low year without remapping it', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { anchor: '0099-06-15', before: 30, after: 5 },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '0099-05-16',
      max: '0099-06-20',
    });
  });

  // The anchor is a bound the protocol declares and is refused when it names a
  // year the picker cannot offer; the window around it is derived, and is held
  // to those years instead. `anchor: "9999-12-31"` with `after: 1` is a
  // schema-valid pair — `isIsoDate` accepts the anchor and the offsets need only
  // be non-negative integers — and derived `10000-01-01`, a five-digit year the
  // runtime's `matchesDatePattern` does not read as a date at all. Its max
  // validator then compared lexically, where `1` sorts below `9`, and rejected
  // the `9999-12-31` the same window also offered.
  it.each([
    { after: 1, before: 0, max: '9999-12-31' },
    { after: 365_250, before: 0, max: '9999-12-31' },
    { after: 0, before: 0, max: '9999-12-31' },
  ])(
    'holds a relative window anchored at the last date offered (after $after)',
    ({ after, before, max }) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Last seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '9999-12-31', before, after },
        },
        TODAY,
      );

      expect(result.dateWindow).toEqual({
        resolution: 'full',
        min: '9999-12-31',
        max,
      });
    },
  );

  // The mirror at the other end: `before` reaching past an early anchor derived
  // `0000-07-05`, a year the native date input cannot hold, or `00-1-11-28`,
  // which is not a date at all — `stepsBetween` reparses it as year zero and the
  // draw writes dates from a year nobody asked for.
  it.each([
    { anchor: '0001-01-01', before: 180, min: '0001-01-01' },
    { anchor: '0001-01-01', before: 400, min: '0001-01-01' },
    { anchor: '0001-06-15', before: 3650, min: '0001-01-01' },
    { anchor: '0002-01-01', before: 400, min: '0001-01-01' },
  ])(
    'holds a relative window reaching behind $anchor at the first date offered',
    ({ anchor, before, min }) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Last seen',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor, before, after: 0 },
        },
        TODAY,
      );

      expect(result.dateWindow).toEqual({
        resolution: 'full',
        min,
        max: anchor,
      });
    },
  );

  // The window is what the draw walks, so the clamp is only worth having if the
  // values it hands back are dates. Seeded draws over the unclamped ceiling
  // alternated between `9999-12-31` and `10000-01-01`, which made whether a
  // generated network validated a matter of which seed produced it.
  it.each([
    { end: 'ceiling', anchor: '9999-12-31', before: 0, after: 1 },
    { end: 'floor', anchor: '0001-01-01', before: 400, after: 0 },
  ])('draws only four-digit calendar dates at the $end', (parameters) => {
    const entry = {
      id: 'v1',
      name: 'Last seen',
      type: 'datetime' as const,
      component: 'RelativeDatePicker' as const,
      parameters,
    };
    const constraints = buildVariableConstraints(entry, TODAY);
    const generator = new ValueGenerator(1, TODAY);
    const drawn = new Set<string>();
    for (let index = 0; index < 32; index++) {
      const value = generator.generateConstrained(
        { entry, constraints },
        index,
      );
      expect(typeof value).toBe('string');
      if (typeof value === 'string') drawn.add(value);
    }

    for (const value of drawn) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(value >= EARLIEST_OFFERED_DATE.full).toBe(true);
      expect(value <= LATEST_OFFERED_DATE.full).toBe(true);
    }
  });

  // Bounds are written at the resolution the picker collects, and protocols in
  // the wild carry all three. Each is a real date, and each is kept.
  it.each([
    { min: '1940', max: '1950' },
    { min: '1940-06', max: '1950-06' },
    { min: '1940-02-29', max: '1950-12-31' },
  ])('accepts a $min bound written at its own resolution', ({ min, max }) => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min, max },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'year',
      min: '1940',
      max: '1950',
    });
  });

  // A bound finer than its picker carries components the control never renders
  // and the validator never compares: `DatePickerField` reads a month picker's
  // `<select>`s off the year and month `ymdPattern` parsed, and
  // `compareDateStrings` truncates the bound to the submitted `YYYY-MM` before
  // comparing. February 31 is a February 2020 floor to both, so it is truncated
  // to one rather than refused as a day the calendar does not hold.
  it.each([
    {
      type: 'month',
      parameter: 'min',
      value: '2020-02-31',
      expected: '2020-02',
    },
    {
      type: 'month',
      parameter: 'max',
      value: '2020-02-31',
      expected: '2020-02',
    },
    { type: 'year', parameter: 'min', value: '2019-02-30', expected: '2019' },
    { type: 'year', parameter: 'max', value: '2020-06-31', expected: '2020' },
  ])(
    'truncates a $type-picker $parameter of "$value" to $expected',
    ({ type, parameter, value, expected }) => {
      const result = buildVariableConstraints(
        {
          id: 'v1',
          name: 'Born',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type, [parameter]: value },
        },
        TODAY,
      );

      expect(result.dateWindow?.[parameter === 'min' ? 'min' : 'max']).toBe(
        expected,
      );
    },
  );

  // The other direction of the same rule: what truncation discards is
  // components finer than the picker's own resolution, never the resolution it
  // collects at. A full picker does render the day, and a day its month does not
  // hold is a bound the two halves of the field disagree about — the native
  // `<input type="date">` ignores a `min` it cannot parse while the interview's
  // validator compares against it lexically, refusing the `2020-02-28` the input
  // offered.
  it.each([{ parameter: 'min' }, { parameter: 'max' }])(
    'refuses a full-picker $parameter naming a day its month does not hold',
    ({ parameter }) => {
      expect(() =>
        buildVariableConstraints(
          {
            id: 'v1',
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type: 'full', [parameter]: '2020-02-31' },
          },
          TODAY,
        ),
      ).toThrow(
        `Date variable "Born" (v1) declares ${parameter} "2020-02-31", which is not a calendar date.`,
      );
    },
  );

  // A component outside the ranges `parseYmd` checks is not a bound the field
  // can read at any resolution, so it is refused at every one — including where
  // the picker would never have rendered that component. `parseYmd` returns null
  // and `DatePickerField` falls back to its own bound (1920-01-01 at the floor,
  // today at the ceiling) while the interview's validator goes on enforcing the
  // declared string, so the control offers dates the submit refuses.
  it.each([
    { type: 'year', parameter: 'min', value: '2020-13-01' },
    { type: 'year', parameter: 'max', value: '2020-06-32' },
    { type: 'month', parameter: 'min', value: '2020-13' },
    { type: 'month', parameter: 'max', value: '2020-00' },
  ])(
    'refuses a $type-picker $parameter of "$value", which its control cannot read',
    ({ type, parameter, value }) => {
      expect(() =>
        buildVariableConstraints(
          {
            id: 'v1',
            name: 'Born',
            type: 'datetime',
            component: 'DatePicker',
            parameters: { type, [parameter]: value },
          },
          TODAY,
        ),
      ).toThrow(
        `Date variable "Born" (v1) declares ${parameter} "${value}", which is not a calendar date.`,
      );
    },
  );

  it('leaves a declared maximum alone', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Born',
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year', min: '1850-01-01', max: '1900-01-01' },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'year',
      min: '1850',
      max: '1900',
    });
  });

  // Built from the schema's own list so a reference rule added there arrives in
  // both the input and the expectation, and a rule this descriptor dropped
  // shows up as a missing target rather than as silence.
  it('reads every variable-reference rule the schema declares', () => {
    const validation = Object.fromEntries(
      VARIABLE_REFERENCE_VALIDATIONS.map((rule) => [rule, 'target']),
    );

    const result = buildVariableConstraints(
      { id: 'v1', name: 'Age', type: 'number', validation },
      TODAY,
    );

    for (const rule of VARIABLE_REFERENCE_VALIDATIONS) {
      expect(result[rule]).toBe('target');
    }
  });

  it('normalises RelativeDatePicker offsets against the supplied today', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
        parameters: { anchor: '2026-07-27', before: 30, after: 5 },
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-06-27',
      max: '2026-08-01',
    });
  });

  it('applies the runtime RelativeDatePicker defaults of 180 before and 0 after', () => {
    const result = buildVariableConstraints(
      {
        id: 'v1',
        name: 'Last seen',
        type: 'datetime',
        component: 'RelativeDatePicker',
      },
      TODAY,
    );

    expect(result.dateWindow).toEqual({
      resolution: 'full',
      min: '2026-01-28',
      max: '2026-07-27',
    });
  });
});

// What the open ceiling is for, read through the pass that acts on it. A
// full-date field whose floor is later than today is one the native input
// offers and the interview accepts, so refusing it would block a preview of a
// protocol nothing is wrong with. The year picker beside it is the control that
// extends around that authored floor by the picker's default window span, so
// both controls remain writable.
describe('a date field whose floor is later than today, through feasibility', () => {
  type DatePickerParameters = {
    type: 'full' | 'month' | 'year';
    min?: string;
    max?: string;
  };

  // Worst-case feasibility bounds, constructed literally: `analyseFeasibility`
  // takes the internal `FeasibilityConfig`, which `generateNetwork` derives
  // from the codebook's declared counts rather than from run-level tuning.
  const config: FeasibilityConfig = {
    nodeCount: { min: 1, max: 8 },
    rosterDrawRatio: 0.7,
    sociogramEdgeProbability: { min: 0.3, max: 0.5 },
    censusEdgeProbability: { min: 0.4, max: 0.6 },
    networkComposerEdgeProbability: { min: 0.05, max: 0.1 },
    familyPedigreeNodeCount: { min: 4, max: 10 },
    today: TODAY,
  };

  const nameGenerator: Stage = {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    form: { title: 'About this person', fields: [] },
    prompts: [{ id: 'p1', text: 'Name people' }],
    behaviours: { maxNodes: 4 },
  };

  function codebookWith(parameters: DatePickerParameters): StructuralCodebook {
    return {
      node: {
        person: {
          color: 'node-color-seq-1',
          variables: {
            due: {
              name: 'Due',
              type: 'datetime',
              component: 'DatePicker',
              parameters,
            },
          },
        },
      },
    };
  }

  it('reports no conflict for a full-date picker', () => {
    const conflicts = analyseFeasibility(
      codebookWith({ type: 'full', min: '2030-01-01' }),
      [nameGenerator],
      config,
    );

    expect(conflicts).toEqual([]);
  });

  it('reports no conflict for a year picker', () => {
    const conflicts = analyseFeasibility(
      codebookWith({ type: 'year', min: '2030' }),
      [nameGenerator],
      config,
    );

    expect(conflicts).toEqual([]);
  });
});

describe('buildEntityConstraints', () => {
  it('builds one entry per codebook variable, keyed by id', () => {
    const result = buildEntityConstraints(
      {
        v1: { name: 'Name', type: 'text', validation: { required: true } },
        v2: { name: 'Age', type: 'number', validation: { minValue: 18 } },
      },
      TODAY,
    );

    expect([...result.keys()]).toEqual(['v1', 'v2']);
    expect(result.get('v1')?.constraints.required).toBe(true);
    expect(result.get('v2')?.constraints.minValue).toBe(18);
    expect(result.get('v2')?.entry.type).toBe('number');
  });

  it('returns an empty map for undefined variables', () => {
    expect(buildEntityConstraints(undefined, TODAY).size).toBe(0);
  });
});
