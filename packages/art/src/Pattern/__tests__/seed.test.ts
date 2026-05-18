import { describe, expect, it } from 'vitest';

import { nextInt, seedToRng } from '../seed';

describe('seedToRng', () => {
  it('returns identical sequences for identical seeds', () => {
    const a = seedToRng('alice');
    const b = seedToRng('alice');
    const sequenceA = Array.from({ length: 10 }, () => a());
    const sequenceB = Array.from({ length: 10 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it('returns floats in [0, 1)', () => {
    const rng = seedToRng('test');
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces different first draws for different seeds', () => {
    const a = seedToRng('alice');
    const b = seedToRng('bob');
    expect(a()).not.toEqual(b());
  });

  it('accepts empty string as a deterministic seed', () => {
    const a = seedToRng('');
    const b = seedToRng('');
    expect(a()).toEqual(b());
  });
});

describe('nextInt', () => {
  it('returns integers in [min, max)', () => {
    const rng = seedToRng('range-test');
    for (let i = 0; i < 50; i++) {
      const n = nextInt(rng, 5, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThan(10);
    }
  });
});
