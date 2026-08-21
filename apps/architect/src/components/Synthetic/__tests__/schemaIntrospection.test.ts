import { describe, expect, it } from 'vitest';

import {
  DatetimeSyntheticSchema,
  MAX_SYNTHETIC_OPTION_WEIGHT,
  NumberSyntheticSchema,
  OrdinalSyntheticSchema,
  ScalarSyntheticSchema,
} from '@codaco/protocol-validation';

import {
  ARRAY_ELEMENT,
  describeDistributions,
  describeFieldWindow,
  describeNestedWindow,
} from '../schemaIntrospection';

/**
 * The oracle for the introspection every control's window comes from.
 *
 * Expectations are written out INDEPENDENTLY here rather than derived, which is
 * the whole point: the editor reads the schema at runtime, and if Zod's
 * internals change shape the derivation would quietly return nothing and every
 * select would empty. These assertions are what fails instead.
 */

const familiesOf = (schema: unknown) =>
  describeDistributions(schema).map((spec) => spec.family);

const parameterNamed = (schema: unknown, family: string, key: string) =>
  describeDistributions(schema)
    .find((spec) => spec.family === family)
    ?.parameters.find((parameter) => parameter.key === key);

describe('the distribution families each variable type offers', () => {
  it('reads a number’s four families in the order the schema declares them', () => {
    expect(familiesOf(NumberSyntheticSchema)).toEqual([
      'constant',
      'uniform',
      'normal',
      'lognormal',
    ]);
  });

  it('reads a scalar’s families, which include beta and exclude lognormal', () => {
    expect(familiesOf(ScalarSyntheticSchema)).toEqual([
      'constant',
      'uniform',
      'normal',
      'beta',
    ]);
  });

  it('reads a datetime’s two families', () => {
    expect(familiesOf(DatetimeSyntheticSchema)).toEqual(['uniform', 'normal']);
  });

  it('finds no family on a schema that declares no distribution at all', () => {
    expect(familiesOf(OrdinalSyntheticSchema)).toEqual([]);
  });
});

describe('the window each parameter is held to', () => {
  it('leaves a number constant unbounded', () => {
    expect(parameterNamed(NumberSyntheticSchema, 'constant', 'value')).toEqual({
      key: 'value',
      optional: false,
      window: { exclusiveMin: false, exclusiveMax: false, integer: false },
    });
  });

  it('bounds a scalar constant to the unit interval', () => {
    expect(
      parameterNamed(ScalarSyntheticSchema, 'constant', 'value')?.window,
    ).toEqual({
      min: 0,
      max: 1,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('reads a beta mean as strictly inside the unit interval', () => {
    expect(
      parameterNamed(ScalarSyntheticSchema, 'beta', 'mean')?.window,
    ).toEqual({
      min: 0,
      max: 1,
      exclusiveMin: true,
      exclusiveMax: true,
      integer: false,
    });
  });

  it('reads a lognormal mean as strictly positive', () => {
    const window = parameterNamed(
      NumberSyntheticSchema,
      'lognormal',
      'mean',
    )?.window;
    expect(window?.min).toBe(0);
    expect(window?.exclusiveMin).toBe(true);
  });

  it('floors every standard deviation at zero, inclusively', () => {
    expect(
      parameterNamed(NumberSyntheticSchema, 'normal', 'sd')?.window,
    ).toEqual({
      min: 0,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('reports which truncation bounds a family leaves unstated', () => {
    expect(
      parameterNamed(NumberSyntheticSchema, 'normal', 'min')?.optional,
    ).toBe(true);
    expect(
      parameterNamed(NumberSyntheticSchema, 'uniform', 'min')?.optional,
    ).toBe(false);
  });

  it('skips a parameter that is not a number', () => {
    // A datetime's bounds are date strings, edited by their own control.
    expect(
      parameterNamed(DatetimeSyntheticSchema, 'uniform', 'min'),
    ).toBeUndefined();
    expect(
      parameterNamed(DatetimeSyntheticSchema, 'normal', 'sdDays')?.window.min,
    ).toBe(0);
  });
});

describe('windows nested below a distribution', () => {
  it('reads the relative date window’s offsets as whole non-negative days', () => {
    expect(
      describeNestedWindow(DatetimeSyntheticSchema, 'uniform', [
        'relative',
        'before',
      ]),
    ).toEqual({
      min: 0,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: true,
    });
  });

  it('reads an option weight’s ceiling from the schema that bounds it', () => {
    expect(
      describeFieldWindow(OrdinalSyntheticSchema, [
        'optionWeights',
        ARRAY_ELEMENT,
        'weight',
      ]),
    ).toEqual({
      min: 0,
      max: MAX_SYNTHETIC_OPTION_WEIGHT,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('returns nothing for a path the schema does not have', () => {
    expect(
      describeFieldWindow(OrdinalSyntheticSchema, ['nonsense']),
    ).toBeUndefined();
  });
});
