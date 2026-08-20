import { describe, expect, it } from 'vitest';

import type { SyntheticCount } from '@codaco/protocol-validation';

import { createSessionStreams } from '../../session-engine/streams';
import { countUniform, sampleCount } from '../sampleCount';

// Every assertion below runs against a seeded stream, so each observed figure
// is fixed rather than a fresh sample — these tests do not flake. The
// tolerances exist to survive a change of generator, not run-to-run variance.
const TEST_SEED = 1234;
const DRAWS = 20_000;

const draw = (count: SyntheticCount, n = DRAWS, seed = TEST_SEED): number[] => {
  const uniform = countUniform(createSessionStreams(seed, 0));
  return Array.from({ length: n }, () => sampleCount(count, uniform));
};

const mean = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

const standardDeviation = (values: number[]): number => {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
      values.length,
  );
};

/** The share of draws that landed on exactly `value`. */
const shareOf = (values: number[], value: number): number =>
  values.filter((drawn) => drawn === value).length / values.length;

describe('sampleCount', () => {
  it('always returns a whole number of entities', () => {
    // A count is a number of people; a fractional one cannot be built.
    for (const count of [
      { distribution: 'constant', value: 4 },
      { distribution: 'uniform', min: 1, max: 9 },
      { distribution: 'poisson', mean: 6 },
      { distribution: 'normal', mean: 8, sd: 3 },
    ] satisfies SyntheticCount[]) {
      expect(draw(count, 200).every(Number.isInteger)).toBe(true);
    }
  });

  it('reproduces the same draws for the same seed', () => {
    const count: SyntheticCount = { distribution: 'normal', mean: 8, sd: 3 };

    const first = draw(count, 100);
    const second = draw(count, 100);
    const other = draw(count, 100, TEST_SEED + 1);

    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('draws counts from the counts substream alone', () => {
    // The whole point of the substream split: a coin flipped elsewhere in the
    // walk must not move how many people a stage elicits. Exercising the coin
    // stream between draws leaves the count sequence untouched.
    const count: SyntheticCount = { distribution: 'normal', mean: 8, sd: 3 };

    const streams = createSessionStreams(TEST_SEED, 0);
    const uniform = countUniform(streams);
    const undisturbed = Array.from({ length: 50 }, () =>
      sampleCount(count, uniform),
    );

    const other = createSessionStreams(TEST_SEED, 0);
    const disturbedUniform = countUniform(other);
    const disturbed = Array.from({ length: 50 }, () => {
      other.draw('coins');
      other.draw('dropout');
      other.uuid();
      return sampleCount(count, disturbedUniform);
    });

    expect(disturbed).toEqual(undisturbed);
  });

  describe('constant', () => {
    it('returns its value every time', () => {
      expect(
        new Set(draw({ distribution: 'constant', value: 7 }, 500)),
      ).toEqual(new Set([7]));
    });

    it('can ask for nobody', () => {
      expect(
        new Set(draw({ distribution: 'constant', value: 0 }, 100)),
      ).toEqual(new Set([0]));
    });
  });

  describe('uniform', () => {
    it('stays inside its bounds and reaches both', () => {
      const drawn = draw({ distribution: 'uniform', min: 2, max: 6 });

      expect(Math.min(...drawn)).toBe(2);
      expect(Math.max(...drawn)).toBe(6);
    });

    it('spreads evenly across its range', () => {
      const drawn = draw({ distribution: 'uniform', min: 1, max: 5 });

      for (const value of [1, 2, 3, 4, 5]) {
        expect(Math.abs(shareOf(drawn, value) - 0.2)).toBeLessThan(0.02);
      }
    });

    it('handles a single-value range', () => {
      expect(
        new Set(draw({ distribution: 'uniform', min: 3, max: 3 }, 100)),
      ).toEqual(new Set([3]));
    });
  });

  describe('poisson', () => {
    it('centres on its mean', () => {
      const drawn = draw({ distribution: 'poisson', mean: 8 });

      expect(Math.abs(mean(drawn) - 8)).toBeLessThan(0.15);
    });

    it('has the variance its mean implies', () => {
      // The defining property of a Poisson: variance equals the mean. A sampler
      // that drew from the wrong family could still centre correctly.
      const drawn = draw({ distribution: 'poisson', mean: 9 });

      expect(Math.abs(standardDeviation(drawn) - 3)).toBeLessThan(0.15);
    });

    it('never returns a negative count', () => {
      expect(Math.min(...draw({ distribution: 'poisson', mean: 1 }))).toBe(0);
    });

    it('returns nobody for a mean of zero', () => {
      expect(new Set(draw({ distribution: 'poisson', mean: 0 }, 200))).toEqual(
        new Set([0]),
      );
    });
  });

  describe('normal', () => {
    it('centres on its mean with the spread it declares', () => {
      const drawn = draw({
        distribution: 'normal',
        mean: 20,
        sd: 5,
        min: 0,
        max: 100,
      });

      expect(Math.abs(mean(drawn) - 20)).toBeLessThan(0.2);
      expect(Math.abs(standardDeviation(drawn) - 5)).toBeLessThan(0.2);
    });

    it('returns its mean when it has no spread', () => {
      expect(
        new Set(draw({ distribution: 'normal', mean: 6, sd: 0 }, 200)),
      ).toEqual(new Set([6]));
    });
  });

  describe('truncation', () => {
    it('keeps every draw inside the declared bounds', () => {
      const drawn = draw({
        distribution: 'normal',
        mean: 8,
        sd: 6,
        min: 2,
        max: 11,
      });

      expect(Math.min(...drawn)).toBeGreaterThanOrEqual(2);
      expect(Math.max(...drawn)).toBeLessThanOrEqual(11);
    });

    it('does not pile rejected draws onto the nearest bound', () => {
      // The regression this guards: CLAMPING a normal(8, 3) into [0, 5] returns
      // exactly 5 in ~88% of draws, because every draw above the cap is moved
      // onto it. Truncating redraws instead, leaving the conditional
      // distribution — around 40% at the bound, with real mass below it.
      const drawn = draw({
        distribution: 'normal',
        mean: 8,
        sd: 3,
        min: 0,
        max: 5,
      });

      expect(shareOf(drawn, 5)).toBeLessThan(0.6);
      expect(shareOf(drawn, 4)).toBeGreaterThan(0.1);
      expect(shareOf(drawn, 3)).toBeGreaterThan(0.05);
    });

    it('truncates a poisson tail without a spike at the cap', () => {
      const drawn = draw({
        distribution: 'poisson',
        mean: 10,
        min: 0,
        max: 6,
      });

      expect(Math.max(...drawn)).toBeLessThanOrEqual(6);
      expect(shareOf(drawn, 6)).toBeLessThan(0.6);
    });

    it('raises the floor without collapsing onto it', () => {
      const drawn = draw({
        distribution: 'poisson',
        mean: 8,
        min: 6,
        max: 100,
      });

      expect(Math.min(...drawn)).toBeGreaterThanOrEqual(6);
      expect(shareOf(drawn, 6)).toBeLessThan(0.6);
    });

    it('returns the only value a single-value window admits', () => {
      // Redrawing could never terminate here on its own, so this is
      // short-circuited rather than left to chance.
      expect(
        new Set(
          draw({ distribution: 'normal', mean: 4, sd: 3, min: 4, max: 4 }, 100),
        ),
      ).toEqual(new Set([4]));
    });
  });
});
