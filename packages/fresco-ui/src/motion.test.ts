import { describe, expect, it } from 'vitest';

import { reduced, springs } from './motion';

describe('reduced', () => {
  it('returns a transition with no duration when motion is reduced', () => {
    expect(reduced(springs.pop, true)).toEqual({ duration: 0 });
  });

  it('returns the given transition when motion is not reduced', () => {
    expect(reduced(springs.pop, false)).toBe(springs.pop);
  });

  it('returns the given transition while the preference is unknown', () => {
    expect(reduced(springs.pop, null)).toBe(springs.pop);
  });
});
