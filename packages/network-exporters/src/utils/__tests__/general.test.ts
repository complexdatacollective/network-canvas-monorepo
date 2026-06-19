import { describe, expect, it } from 'vitest';

import { isCategoricalOptionSelected } from '../general';

describe('isCategoricalOptionSelected', () => {
  // Categorical attributes are stored as arrays of selected option values, so a
  // falsy element such as `0` must still match the corresponding option.
  it('treats [0] as selected when option value is 0', () => {
    expect(isCategoricalOptionSelected([0], 0)).toBe(true);
  });

  it('returns false when the option value is not in the array', () => {
    expect(isCategoricalOptionSelected([0], 1)).toBe(false);
  });

  it('treats an empty array as nothing selected', () => {
    expect(isCategoricalOptionSelected([], 0)).toBe(false);
  });

  it('treats null as not selected', () => {
    expect(isCategoricalOptionSelected(null, 0)).toBe(false);
  });

  it('treats undefined as not selected', () => {
    expect(isCategoricalOptionSelected(undefined, 0)).toBe(false);
  });
});
