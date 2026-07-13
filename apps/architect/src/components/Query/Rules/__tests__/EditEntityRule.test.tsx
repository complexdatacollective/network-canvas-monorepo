import { describe, expect, it } from 'vitest';

import { toEditValue } from '../EditEntityRule';

describe('toEditValue', () => {
  it('passes categorical array operands through so saved selections survive', () => {
    expect(toEditValue(['green', 'blue'])).toEqual(['green', 'blue']);
  });

  it('preserves scalar operands', () => {
    expect(toEditValue('exact')).toBe('exact');
    expect(toEditValue(7)).toBe(7);
    expect(toEditValue(true)).toBe(true);
    expect(toEditValue(false)).toBe(false);
  });

  it('keeps only primitive members of an array operand', () => {
    expect(toEditValue(['green', 3, { nested: true }, null])).toEqual([
      'green',
      3,
    ]);
  });

  it('falls back to an empty string for nullish operands', () => {
    expect(toEditValue(undefined)).toBe('');
    expect(toEditValue(null)).toBe('');
  });
});
