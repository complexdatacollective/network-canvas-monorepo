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

  // A ceiling of today under a floor the protocol declares later than it would
  // read as an empty range the protocol never wrote, and refuse a date the
  // draw reaches perfectly well.
  it('never closes a window below a floor the protocol declares', () => {
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
      max: '2030',
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
