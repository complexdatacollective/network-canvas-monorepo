import type { SyntheticCount } from './index.ts';

// --------------------------------
// Schema 8 Specific helpers
// --------------------------------

/**
 * The most entities a count can ask for, which is what has to be bounded — not
 * its parameters one at a time.
 *
 * The generator draws within six deviations of a mean and plans once per
 * entity and once per PAIR, so `{ mean: 10_000, sd: 10_000 }` reaches 70,000
 * people and 2.45 billion pairs while every individual parameter looks
 * reasonable. Defined here, beside the schema that admits the count.
 *
 * Module-private: {@link syntheticCountSupport} is the only reader, and is
 * what every other file asks. Exporting a second, subtly different bound would
 * invite a caller to plan against the clamp when it meant the support.
 */
function syntheticCountCeiling(count: {
  distribution: string;
  value?: number;
  mean?: number;
  sd?: number;
  min?: number;
  max?: number;
}): number {
  switch (count.distribution) {
    case 'constant':
      return count.value ?? 0;
    case 'uniform':
      return count.max ?? 0;
    case 'poisson':
      return (
        count.max ??
        Math.max(
          count.min ?? 0,
          Math.ceil((count.mean ?? 0) + 6 * Math.sqrt(count.mean ?? 0) + 1),
        )
      );
    case 'normal':
      return (
        count.max ??
        Math.max(
          count.min ?? 0,
          0,
          Math.ceil((count.mean ?? 0) + 6 * (count.sd ?? 0)),
        )
      );
    default:
      return 0;
  }
}

/**
 * The counts a declaration can ACTUALLY land on, as an inclusive window.
 *
 * Distinct from {@link syntheticCountCeiling}, and the distinction is the
 * point: that one is the bound `sampleCount` CLAMPS into, this one is the
 * support the draw can reach. They differ exactly where a family is
 * degenerate — a zero-mean Poisson has one outcome, and a zero-deviation
 * normal always rounds its single mean — so a declared `max` there is a clamp
 * that can never bind. Feasibility must count against the support: reading the
 * clamp instead, `{ mean: 1, sd: 0, max: 20 }` always builds one node while
 * preflight counted twenty, and a `unique` variable with a small value space
 * was refused for entities the run never creates.
 *
 * One derivation, used by the stage schema that admits the count and by the
 * generator that plans against it, so the two cannot drift.
 */
export function syntheticCountSupport(count: SyntheticCount): {
  floor: number;
  ceiling: number;
} {
  switch (count.distribution) {
    case 'constant':
      return { floor: count.value, ceiling: count.value };
    case 'uniform':
      return { floor: count.min, ceiling: count.max };
    case 'poisson':
      // A zero-mean Poisson has exactly one outcome. An explicit maximum is
      // only a clamp and cannot make any positive count reachable.
      if (count.mean === 0) return { floor: 0, ceiling: 0 };
      return { floor: count.min ?? 0, ceiling: syntheticCountCeiling(count) };
    case 'normal': {
      // With no spread the sampler always rounds this one mean. Bounds are
      // clamps, not extra support (the count schema has already proved the
      // mean lies inside them).
      if (count.sd === 0) {
        const value = Math.round(count.mean);
        return { floor: value, ceiling: value };
      }
      return { floor: count.min ?? 0, ceiling: syntheticCountCeiling(count) };
    }
  }
}
