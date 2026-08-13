import { describe, expect, it } from 'vitest';

import { requireStageFieldValue } from '../requireStageFieldValue';

describe('requireStageFieldValue', () => {
  it('rejects null instead of silently normalizing it', () => {
    expect(() => requireStageFieldValue(null)).toThrow(TypeError);
  });

  it('preserves valid structured field values', () => {
    const value = { join: 'AND', rules: [{ type: 'node' }] };

    expect(requireStageFieldValue(value)).toBe(value);
    expect(requireStageFieldValue([value])).toEqual([value]);
  });

  it('rejects an array containing a null field item', () => {
    expect(() => requireStageFieldValue([null])).toThrow(TypeError);
  });
});
