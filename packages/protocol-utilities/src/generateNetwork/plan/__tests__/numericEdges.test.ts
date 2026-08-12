import { describe, expect, it } from 'vitest';

import type { VariableEntry } from '../../../types';
import { ValueGenerator } from '../../../ValueGenerator';
import { buildVariableConstraints } from '../../constraints/buildConstraints';
import { sampleContinuous, sampleWeightedIndex } from '../distributions';
import { createRandomSource } from '../random';

/**
 * Schema-valid parameters at the edges of double precision. Each of these
 * produced a value the descriptor did not ask for — and, because the results
 * survive rounding and clamping, a network holding nulls or a constant where
 * a distribution was declared.
 */

const streamOf = (seed: number) => createRandomSource(seed).stream('t');

describe('a uniform over a very wide range', () => {
  it('stays finite where the width alone would overflow', () => {
    // max - min is Infinity here, so scaling a width gives a non-finite value
    // that serialises to null.
    for (let seed = 1; seed <= 20; seed++) {
      const drawn = streamOf(seed).float(-1e308, 1e308);
      expect(Number.isFinite(drawn), `seed ${seed}`).toBe(true);
      expect(drawn).toBeGreaterThanOrEqual(-1e308);
      expect(drawn).toBeLessThanOrEqual(1e308);
    }
  });

  it('still spans its range rather than collapsing to a midpoint', () => {
    const drawn = Array.from({ length: 40 }, (_unused, index) =>
      streamOf(index + 1).float(0, 10),
    );
    expect(Math.min(...drawn)).toBeLessThan(3);
    expect(Math.max(...drawn)).toBeGreaterThan(7);
  });
});

describe('a beta pinned arbitrarily close to its mean', () => {
  it('draws the mean rather than an endpoint', () => {
    // sd² underflows to zero, so both shapes become Infinity. The endpoint
    // limit is the WRONG limit here: vanishing shapes go to the endpoints,
    // diverging ones concentrate on the mean.
    for (let seed = 1; seed <= 20; seed++) {
      const drawn = sampleContinuous(
        { distribution: 'beta', mean: 0.5, sd: 1e-200 },
        { min: 0, max: 1 },
        streamOf(seed),
      );
      expect(drawn, `seed ${seed}`).toBeCloseTo(0.5, 6);
    }
  });
});

describe('a lognormal spanning the whole double range', () => {
  it('keeps its log-space parameters finite', () => {
    // sd / mean is the range squared, so it overflows to Infinity and takes
    // both log-space parameters to NaN with it — which clamping and rounding
    // preserve all the way to a serialised null.
    for (let seed = 1; seed <= 20; seed++) {
      const drawn = sampleContinuous(
        { distribution: 'lognormal', mean: 1e-308, sd: 1e308 },
        {},
        streamOf(seed),
      );
      expect(Number.isNaN(drawn), `seed ${seed}`).toBe(false);
      expect(Number.isFinite(drawn), `seed ${seed}`).toBe(true);
    }
  });

  it('still draws around the mean at ordinary parameters', () => {
    // The overflow-safe route has to agree with the direct one everywhere it
    // was already correct.
    const drawn = Array.from({ length: 200 }, (_unused, index) =>
      sampleContinuous(
        { distribution: 'lognormal', mean: 8, sd: 7 },
        {},
        streamOf(index + 1),
      ),
    );
    const mean = drawn.reduce((sum, value) => sum + value, 0) / drawn.length;
    expect(mean).toBeGreaterThan(5);
    expect(mean).toBeLessThan(12);
  });
});

describe('a declared window narrower than the readable grid', () => {
  const TODAY = '2026-08-12';
  /** Twenty draws of one declared number variable. */
  const drawsOf = (entry: Record<string, unknown>): number[] => {
    const generator = new ValueGenerator(7, TODAY);
    const variable = {
      entry: entry as unknown as VariableEntry,
      constraints: buildVariableConstraints(
        entry as unknown as VariableEntry,
        TODAY,
      ),
    };
    return Array.from(
      { length: 20 },
      (_unused, index) =>
        generator.generateConstrained(variable, index, 'node:person') as number,
    );
  };

  it('keeps drawn values inside the window the author declared', () => {
    // The two-decimal grid is there to keep a continuous draw readable. Over a
    // window narrower than one of its steps it has no point to offer, and
    // rounding into it sent every draw to 0 — outside the declared window
    // entirely, because the clamp that followed knew only the validation
    // bounds, which this variable does not have.
    const drawn = drawsOf({
      id: 'ratio',
      name: 'Ratio',
      type: 'number',
      synthetic: { distribution: 'uniform', min: 0.001, max: 0.002 },
    });

    for (const [index, value] of drawn.entries()) {
      expect(value, `draw ${index}`).toBeGreaterThanOrEqual(0.001);
      expect(value, `draw ${index}`).toBeLessThanOrEqual(0.002);
    }
  });

  it('still rounds a window the grid can express', () => {
    // The ordinary case has to keep its readable values.
    const drawn = drawsOf({
      id: 'score',
      name: 'Score',
      type: 'number',
      synthetic: { distribution: 'uniform', min: 0, max: 10 },
    });

    for (const [index, value] of drawn.entries()) {
      expect(Number(value.toFixed(2)), `draw ${index}`).toBe(value);
    }
  });
});

describe('option weights at the top of the double range', () => {
  it('keeps equal weights equally likely', () => {
    // Two weights of 1e308 sum to Infinity, so no iteration can ever select
    // and every draw returned the final option.
    const counts = [0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      counts[sampleWeightedIndex([1e308, 1e308], streamOf(seed))]! += 1;
    }
    expect(counts[0]).toBeGreaterThan(50);
    expect(counts[1]).toBeGreaterThan(50);
  });

  it('still honours a declared imbalance', () => {
    const counts = [0, 0];
    for (let seed = 1; seed <= 200; seed++) {
      counts[sampleWeightedIndex([1e308, 1e300], streamOf(seed))]! += 1;
    }
    expect(counts[1]).toBe(0);
  });
});
