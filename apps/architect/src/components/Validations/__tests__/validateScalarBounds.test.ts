import { describe, expect, it } from 'vitest';

import { makeValidate } from '../Validations';

const validateScalar = makeValidate('scalar');
const validateNumber = makeValidate('number');

describe('scalar bound validation', () => {
  it('accepts a complete, ordered pair', () => {
    expect(validateScalar({ minValue: 2, maxValue: 10 })).toBeUndefined();
  });

  it('accepts a scalar with no bounds at all', () => {
    expect(validateScalar({ required: true })).toBeUndefined();
  });

  // redux-form hands the validator the field's raw value, which is null until
  // the variable has any validation rules at all.
  it('tolerates a null or undefined field value', () => {
    expect(validateScalar(null)).toBeUndefined();
    expect(validateScalar(undefined)).toBeUndefined();
    expect(validateScalar({})).toBeUndefined();
  });

  it('rejects a minValue with no maxValue', () => {
    expect(validateScalar({ minValue: 10 })).toBe(
      'Minimum value needs a Maximum value greater than it',
    );
  });

  it('rejects a maxValue with no minValue', () => {
    expect(validateScalar({ maxValue: 10 })).toBe(
      'Maximum value needs a Minimum value less than it',
    );
  });

  it('rejects an inverted pair', () => {
    expect(validateScalar({ minValue: 10, maxValue: 2 })).toBe(
      'Minimum value must be less than Maximum value',
    );
  });

  it('rejects an equal pair', () => {
    expect(validateScalar({ minValue: 5, maxValue: 5 })).toBe(
      'Minimum value must be less than Maximum value',
    );
  });

  it('leaves number variable bounds unconstrained', () => {
    expect(validateNumber({ minValue: 10 })).toBeUndefined();
  });

  it('still reports rules missing a value, ahead of the bounds check', () => {
    expect(validateScalar({ minValue: null })).toBe(
      'Validations (minValue) must have values',
    );
  });
});
