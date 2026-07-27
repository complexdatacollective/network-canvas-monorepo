import { describe, expect, it } from 'vitest';

import { VARIABLE_REFERENCE_VALIDATIONS } from '@codaco/protocol-validation';

import {
  buildEntityConstraints,
  buildVariableConstraints,
} from '../buildConstraints';

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

  // The field lists what it offers from its ceiling down to its floor, so a
  // floor declared above today leaves it offering nothing. Reported as the
  // empty window it is, rather than raised to meet the floor and generate the
  // one date the control can neither select nor display.
  it('holds the implicit ceiling under a floor declared later than today', () => {
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
      max: '2026',
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

  // A bound coarser than its picker is a real date, so it survives the calendar
  // check, and `truncateToResolution` only ever slices — it has nothing to add.
  // Left in a full-resolution window it reaches the draw as an incomplete
  // string, where `addDays` finds no day to advance and hands it straight back:
  // every offset in the window draws the literal `"2020"`, which the native
  // full-date input cannot display.
  it.each([
    { parameter: 'min', value: '2020', type: 'full', written: 'YYYY-MM-DD' },
    { parameter: 'max', value: '2020', type: 'full', written: 'YYYY-MM-DD' },
    { parameter: 'min', value: '2020-06', type: 'full', written: 'YYYY-MM-DD' },
    { parameter: 'max', value: '2020', type: 'month', written: 'YYYY-MM' },
  ])(
    'refuses a $parameter of "$value" on a $type picker',
    ({ parameter, value, type, written }) => {
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
        `Date variable "Born" (v1) declares ${parameter} "${value}", which is coarser than the date its picker collects. ` +
          `Synthetic data generation needs a bound written as ${written}.`,
      );
    },
  );

  // Its offsets are counted in days from the anchor, so a coarser one leaves
  // `addDays` nothing to advance and collapses the window onto the anchor.
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
