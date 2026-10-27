import { describe, expect, it } from 'vitest';

import {
  isDateFilterValue,
  isFacetedFilterValue,
  isFilterValue,
  isOperatorFilterValue,
  isRangeFilterValue,
} from '../types';

describe('filter value guards', () => {
  it('accepts the value each filter writes', () => {
    expect(isRangeFilterValue({ min: 1, max: 5 })).toBe(true);
    expect(isDateFilterValue({ from: '2024-01-01', to: '2024-02-01' })).toBe(
      true,
    );
    expect(isFacetedFilterValue(['a', 'b'])).toBe(true);
    expect(isOperatorFilterValue({ conditions: [] })).toBe(true);
  });

  it('rejects a value another filter wrote', () => {
    expect(isRangeFilterValue({ from: 'a', to: 'b' })).toBe(false);
    expect(isRangeFilterValue('1-5')).toBe(false);
    expect(isDateFilterValue({ min: 1, max: 5 })).toBe(false);
    expect(isFacetedFilterValue('a')).toBe(false);
    expect(isFacetedFilterValue(['a', 1])).toBe(false);
    expect(isOperatorFilterValue(['a'])).toBe(false);
    expect(isOperatorFilterValue(null)).toBe(false);
  });

  it('treats text, booleans and each object shape as a filter value', () => {
    for (const value of [
      'text',
      '',
      true,
      false,
      { min: 0, max: 1 },
      ['a'],
      { conditions: [] },
    ]) {
      expect(isFilterValue(value)).toBe(true);
    }
    for (const value of [undefined, null, 3, {}, { other: 1 }]) {
      expect(isFilterValue(value)).toBe(false);
    }
  });
});
