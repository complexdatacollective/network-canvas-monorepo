import { describe, expect, it } from 'vitest';

import {
  sampleContinuous,
  sampleCount,
  sampleWeightedIndex,
  sampleWithoutReplacement,
} from '../distributions';
import { createRandomSource } from '../random';

const N = 20000;

const stream = (label: string) => createRandomSource(42).stream(label);

const collect = (count: number, draw: () => number): number[] =>
  Array.from({ length: count }, draw);

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const standardDeviation = (values: number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};

describe('sampleCount', () => {
  it('returns a constant exactly', () => {
    const s = stream('constant');
    expect(sampleCount({ distribution: 'constant', value: 5 }, s)).toBe(5);
  });

  it('draws uniform counts across the whole range', () => {
    const s = stream('uniform-count');
    const values = collect(N, () =>
      sampleCount({ distribution: 'uniform', min: 1, max: 8 }, s),
    );
    expect(Math.min(...values)).toBe(1);
    expect(Math.max(...values)).toBe(8);
    expect(mean(values)).toBeCloseTo(4.5, 1);
  });

  it('draws poisson counts with the declared mean', () => {
    const s = stream('poisson');
    const values = collect(N, () =>
      sampleCount({ distribution: 'poisson', mean: 3 }, s),
    );
    for (const value of values.slice(0, 100)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(mean(values)).toBeCloseTo(3, 1);
  });

  it('uses the normal approximation for large poisson means', () => {
    const s = stream('poisson-large');
    const values = collect(N, () =>
      sampleCount({ distribution: 'poisson', mean: 40 }, s),
    );
    expect(mean(values)).toBeGreaterThan(39);
    expect(mean(values)).toBeLessThan(41);
  });

  it('rounds and truncates normal counts into their window', () => {
    const s = stream('normal-count');
    const values = collect(N, () =>
      sampleCount(
        { distribution: 'normal', mean: 18, sd: 6, min: 5, max: 40 },
        s,
      ),
    );
    for (const value of values.slice(0, 200)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(40);
    }
    expect(mean(values)).toBeCloseTo(18, 0);
  });

  it('keeps normal counts non-negative without explicit truncation', () => {
    const s = stream('normal-count-negative');
    const values = collect(N, () =>
      sampleCount({ distribution: 'normal', mean: 0.5, sd: 2 }, s),
    );
    expect(Math.min(...values)).toBe(0);
  });
});

describe('sampleContinuous', () => {
  it('draws truncated normals inside the hard bounds', () => {
    const s = stream('normal');
    const values = collect(N, () =>
      sampleContinuous(
        { distribution: 'normal', mean: 34, sd: 12 },
        { min: 18, max: 99 },
        s,
      ),
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...values)).toBeLessThanOrEqual(99);
    // Truncation at 18 shifts the mean slightly above 34.
    expect(mean(values)).toBeGreaterThan(33.5);
    expect(mean(values)).toBeLessThan(36.5);
  });

  it('draws uniforms across the descriptor window', () => {
    const s = stream('uniform');
    const values = collect(N, () =>
      sampleContinuous({ distribution: 'uniform', min: 20, max: 60 }, {}, s),
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...values)).toBeLessThanOrEqual(60);
    expect(mean(values)).toBeCloseTo(40, 0);
  });

  it('falls back to the hard window when a uniform omits bounds', () => {
    const s = stream('uniform-domain');
    const values = collect(N, () =>
      sampleContinuous({ distribution: 'uniform' }, { min: 0, max: 1 }, s),
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(mean(values)).toBeCloseTo(0.5, 1);
  });

  it('throws when a uniform has no finite window at all', () => {
    const s = stream('uniform-unbounded');
    expect(() => sampleContinuous({ distribution: 'uniform' }, {}, s)).toThrow(
      /finite window/,
    );
  });

  it('clamps constants into the hard bounds', () => {
    const s = stream('constant');
    expect(
      sampleContinuous({ distribution: 'constant', value: 5 }, { min: 18 }, s),
    ).toBe(18);
  });

  it('draws lognormals with the declared natural-units mean', () => {
    const s = stream('lognormal');
    const values = collect(N, () =>
      sampleContinuous({ distribution: 'lognormal', mean: 8, sd: 7 }, {}, s),
    );
    expect(Math.min(...values)).toBeGreaterThan(0);
    expect(mean(values)).toBeGreaterThan(7.5);
    expect(mean(values)).toBeLessThan(8.5);
  });

  it('draws betas with the declared mean and sd', () => {
    const s = stream('beta');
    const values = collect(N, () =>
      sampleContinuous(
        { distribution: 'beta', mean: 0.7, sd: 0.18 },
        { min: 0, max: 1 },
        s,
      ),
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    expect(mean(values)).toBeCloseTo(0.7, 1);
    expect(standardDeviation(values)).toBeCloseTo(0.18, 1);
  });

  it('returns the mean for a zero-sd beta', () => {
    const s = stream('beta-constant');
    expect(
      sampleContinuous(
        { distribution: 'beta', mean: 0.4, sd: 0 },
        { min: 0, max: 1 },
        s,
      ),
    ).toBe(0.4);
  });
});

describe('sampleWeightedIndex', () => {
  it('selects indices proportionally to their weights', () => {
    const s = stream('weighted');
    const counts = [0, 0];
    for (let i = 0; i < N; i++) {
      counts[sampleWeightedIndex([1, 3], s)]! += 1;
    }
    expect(counts[0]! / N).toBeCloseTo(0.25, 1);
    expect(counts[1]! / N).toBeCloseTo(0.75, 1);
  });

  it('never selects a zero-weight index', () => {
    const s = stream('weighted-zero');
    for (let i = 0; i < 500; i++) {
      expect(sampleWeightedIndex([0, 1, 0], s)).toBe(1);
    }
  });
});

describe('sampleWithoutReplacement', () => {
  it('returns distinct values and never a zero-weight one', () => {
    const s = stream('without-replacement');
    for (let i = 0; i < 500; i++) {
      const picked = sampleWithoutReplacement(['a', 'b', 'c'], [5, 1, 0], 2, s);
      expect(picked).toHaveLength(2);
      expect(new Set(picked).size).toBe(2);
      expect(picked).not.toContain('c');
    }
  });

  it('stops at the number of positively-weighted values', () => {
    const s = stream('without-replacement-short');
    expect(
      sampleWithoutReplacement(['a', 'b', 'c'], [1, 1, 0], 5, s),
    ).toHaveLength(2);
  });

  it('prefers heavier values in aggregate', () => {
    const s = stream('without-replacement-bias');
    let firstIsHeavy = 0;
    for (let i = 0; i < N; i++) {
      const [first] = sampleWithoutReplacement(
        ['heavy', 'light'],
        [4, 1],
        1,
        s,
      );
      if (first === 'heavy') firstIsHeavy += 1;
    }
    expect(firstIsHeavy / N).toBeCloseTo(0.8, 1);
  });
});
