import { describe, expect, it } from 'vitest';

import { findValidationContradictions } from '../variables/validation-contradictions.ts';

describe('findValidationContradictions — local checks', () => {
  it('reports minLength > maxLength, stripping both members', () => {
    const result = findValidationContradictions({
      a: {
        name: 'first_name',
        type: 'text',
        validation: { minLength: 10, maxLength: 2 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('invertedBounds');
    expect(result[0]?.message).toBe(
      'Variable "first_name": minLength (10) is greater than maxLength (2)',
    );
    expect(result[0]?.variableIds).toEqual(['a']);
    expect(result[0]?.strips).toEqual([
      { variableId: 'a', rule: 'minLength' },
      { variableId: 'a', rule: 'maxLength' },
    ]);
  });

  it('reports minValue > maxValue and minSelected > maxSelected', () => {
    const result = findValidationContradictions({
      a: { name: 'age', type: 'number', validation: { minValue: 10, maxValue: 2 } },
      b: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { minSelected: 4, maxSelected: 1 },
      },
    });
    expect(result.map((c) => c.class).sort()).toEqual([
      'invertedBounds',
      'invertedBounds',
      'minSelectedExceedsOptions',
    ]);
  });

  it('reports minSelected greater than the option count, stripping minSelected only', () => {
    const result = findValidationContradictions({
      a: {
        name: 'colors',
        type: 'categorical',
        options: [
          { label: 'Red', value: 'red' },
          { label: 'Blue', value: 'blue' },
        ],
        validation: { minSelected: 3 },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.class).toBe('minSelectedExceedsOptions');
    expect(result[0]?.message).toBe(
      'Variable "colors": minSelected (3) is greater than the number of options (2)',
    );
    expect(result[0]?.strips).toEqual([{ variableId: 'a', rule: 'minSelected' }]);
  });

  it('accepts equal bounds and minSelected equal to the option count', () => {
    expect(
      findValidationContradictions({
        a: { name: 'age', type: 'number', validation: { minValue: 5, maxValue: 5 } },
        b: {
          name: 'colors',
          type: 'categorical',
          options: [
            { label: 'Red', value: 'red' },
            { label: 'Blue', value: 'blue' },
          ],
          validation: { minSelected: 2, maxSelected: 2 },
        },
      }),
    ).toEqual([]);
  });

  it('ignores variables with no validation and non-numeric rule values', () => {
    expect(
      findValidationContradictions({
        a: { name: 'layout', type: 'layout' },
        b: { name: 'age', type: 'number', validation: { minValue: 'ten' } },
      }),
    ).toEqual([]);
  });
});
