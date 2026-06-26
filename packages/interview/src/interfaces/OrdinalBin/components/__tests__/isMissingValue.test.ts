import { describe, expect, it } from 'vitest';

import { isMissingValue } from '../OrdinalBinItem';

describe('isMissingValue', () => {
  it('treats a negative number value as missing', () => {
    expect(isMissingValue(-1)).toBe(true);
  });

  it('treats a negative numeric-string value as missing', () => {
    // An option representing N/A may carry a string value, e.g. value: '-1'.
    expect(isMissingValue('-1')).toBe(true);
  });

  it('treats a non-negative number value as not missing', () => {
    expect(isMissingValue(1)).toBe(false);
    expect(isMissingValue(0)).toBe(false);
  });

  it('treats a non-negative numeric-string value as not missing', () => {
    expect(isMissingValue('1')).toBe(false);
  });

  it('treats a non-numeric string value as not missing', () => {
    expect(isMissingValue('low')).toBe(false);
  });

  it('treats a boolean value as not missing', () => {
    expect(isMissingValue(true)).toBe(false);
    expect(isMissingValue(false)).toBe(false);
  });
});
