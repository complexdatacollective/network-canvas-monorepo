import { describe, expect, it } from 'vitest';

import { isUnplaced } from '../useOrdinalBins';

describe('isUnplaced', () => {
  const optionValues = [1, 2, 3, 4];

  it('treats a value that matches an option as placed', () => {
    expect(isUnplaced(2, optionValues)).toBe(false);
  });

  it('treats a non-null value that matches no option as unplaced', () => {
    // Arises from option-set reduction across a migration or imported roster
    // data: value 5 while options define 1-4.
    expect(isUnplaced(5, optionValues)).toBe(true);
  });

  it('treats a null value as unplaced (regression guard)', () => {
    expect(isUnplaced(null, optionValues)).toBe(true);
  });

  it('treats an undefined value as unplaced (regression guard)', () => {
    expect(isUnplaced(undefined, optionValues)).toBe(true);
  });

  it('matches by strict value identity', () => {
    expect(isUnplaced('2', optionValues)).toBe(true);
    expect(isUnplaced(2, [1, 2, 3, 4])).toBe(false);
  });
});
