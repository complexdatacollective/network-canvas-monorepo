import { describe, expect, it } from 'vitest';

import { getUpdatedValue } from '../withUpdateHandlers';

describe('getUpdatedValue', () => {
  it('does not overwrite another validation when a duplicate key is requested', () => {
    const value = { required: true, minLength: 2 };

    expect(getUpdatedValue(value, 'required', 2, 'minLength')).toBe(value);
  });

  it('renames a validation while preserving compatible values', () => {
    expect(
      getUpdatedValue({ minLength: 2 }, 'maxLength', 2, 'minLength'),
    ).toEqual({ maxLength: 2 });
  });
});
