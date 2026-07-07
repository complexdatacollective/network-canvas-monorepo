import { describe, expect, it } from 'vitest';

import { coerceFormValues } from './coerceFormValues';

describe('coerceFormValues', () => {
  it('coerces a number field string to a real number', () => {
    const result = coerceFormValues(
      { age: '42', name: 'Alice' },
      new Set(['age']),
    );

    expect(result.age).toBe(42);
    expect(typeof result.age).toBe('number');
    // Non-number fields are untouched.
    expect(result.name).toBe('Alice');
  });

  it('preserves an already-numeric value', () => {
    const result = coerceFormValues({ age: 7 }, new Set(['age']));
    expect(result.age).toBe(7);
  });

  it('coerces empty/undefined number values to undefined', () => {
    const result = coerceFormValues(
      { age: '', weight: undefined },
      new Set(['age', 'weight']),
    );
    expect(result.age).toBeUndefined();
    expect(result.weight).toBeUndefined();
  });

  it('leaves non-numeric string input untouched (validation rejects it)', () => {
    const result = coerceFormValues({ age: 'abc' }, new Set(['age']));
    expect(result.age).toBe('abc');
  });

  it('does not coerce fields outside the number set', () => {
    const result = coerceFormValues({ code: '0042' }, new Set());
    expect(result.code).toBe('0042');
  });

  it('does not mutate the input object', () => {
    const input = { age: '5' };
    coerceFormValues(input, new Set(['age']));
    expect(input.age).toBe('5');
  });
});
