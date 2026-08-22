import { describe, expect, it } from 'vitest';

import {
  type EdgeTopology,
  type SyntheticCount,
  type Variables,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { buildEntityConstraints } from '../constraints/buildConstraints';
import type { GenerationContext } from '../constraints/context';
import {
  type EntityScopeRef,
  generateEntityAttributes,
} from '../constraints/generateEntityAttributes';
import { UniqueRegistry } from '../constraints/uniqueRegistry';
import { ValueGenerator } from '../constraints/ValueGenerator';
import { createSessionStreams } from '../session-engine/streams';
import { chooseLinkedPairs, unorderedPairs } from '../utils/edgeTopology';
import { countUniform, sampleCount } from '../utils/sampleCount';

/**
 * Criterion C7 — distribution faithfulness.
 *
 * A researcher who declares `normal(mean 8, sd 3)` is making a claim about the
 * data they will get back, and a generator that centres somewhere else, or
 * spreads differently, silently replaces their model with its own. So every
 * declarable family is measured here against the parameters it was given.
 *
 * TOLERANCES ARE ARITHMETIC, NOT TASTE. Each is derived from the standard error
 * of the statistic being compared, and stated beside it:
 *
 *   - a sample MEAN of N draws from a distribution with deviation σ has
 *     standard error σ/√N;
 *   - a sample DEVIATION has standard error ≈ σ/√(2N);
 *   - a sample PROPORTION p has standard error √(p(1−p)/N).
 *
 * Every bound below is FIVE standard errors, which a correct sampler clears
 * with probability ≈ 1 − 6×10⁻⁷ per assertion. The runs are seeded, so a bound
 * that holds here holds on every machine — the five-sigma width is there to
 * survive a change of generator, not run-to-run variance.
 */

const DRAWS = 10_000;
/** √10 000 = 100, so a five-standard-error bound is σ/20. */
const MEAN_TOLERANCE = (deviation: number): number => 5 * (deviation / 100);
/** √(2 × 10 000) ≈ 141.42. */
const DEVIATION_TOLERANCE = (deviation: number): number =>
  5 * (deviation / Math.sqrt(2 * DRAWS));
const PROPORTION_TOLERANCE = (share: number): number =>
  5 * Math.sqrt((share * (1 - share)) / DRAWS);

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

const deviation = (values: readonly number[]): number => {
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
      values.length,
  );
};

const shareOf = <T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
): number => values.filter(predicate).length / values.length;

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

const countDraws = (count: SyntheticCount, seed = 4242): number[] => {
  const uniform = countUniform(createSessionStreams(seed, 0));
  return Array.from({ length: DRAWS }, () => sampleCount(count, uniform));
};

describe('a declared count realises the distribution it names', () => {
  it('returns a constant every time', () => {
    expect(new Set(countDraws({ distribution: 'constant', value: 7 }))).toEqual(
      new Set([7]),
    );
  });

  it('spreads a uniform evenly over its inclusive range', () => {
    // [2, 8] is seven values; each should take a seventh of the draws. The
    // proportion tolerance at p = 1/7 is 5√(p(1−p)/N) ≈ 0.0175.
    const drawn = countDraws({ distribution: 'uniform', min: 2, max: 8 });
    const share = 1 / 7;

    for (const value of [2, 3, 4, 5, 6, 7, 8]) {
      expect(
        Math.abs(shareOf(drawn, (count) => count === value) - share),
      ).toBeLessThan(PROPORTION_TOLERANCE(share));
    }
  });

  it('gives a poisson the variance its mean implies', () => {
    // The defining property: variance equals the mean, so σ = √9 = 3. A
    // sampler drawing from the wrong family can still centre correctly, which
    // is why the deviation is asserted beside the mean.
    const drawn = countDraws({ distribution: 'poisson', mean: 9 });

    // A Poisson is already whole-numbered, so nothing is added to either bound
    // beyond sampling error.
    expect(Math.abs(mean(drawn) - 9)).toBeLessThan(MEAN_TOLERANCE(3));
    expect(Math.abs(deviation(drawn) - 3)).toBeLessThan(DEVIATION_TOLERANCE(3));
  });

  it('centres a normal on its mean with the spread it declares', () => {
    const drawn = countDraws({
      distribution: 'normal',
      mean: 40,
      sd: 8,
      min: 0,
      max: 100,
    });

    // The window is five deviations either side of the mean, so truncation
    // removes under a millionth of the mass and shifts neither statistic
    // measurably at this sample size.
    expect(Math.abs(mean(drawn) - 40)).toBeLessThan(MEAN_TOLERANCE(8));
    expect(Math.abs(deviation(drawn) - 8)).toBeLessThan(
      DEVIATION_TOLERANCE(8) +
        // Rounding a real draw to a whole person adds a uniform ±0.5 error,
        // which inflates the observed variance by 1/12; on σ = 8 that is
        // √(64 + 1/12) − 8 ≈ 0.0052.
        0.006,
    );
  });
});

// ---------------------------------------------------------------------------
// Edge topology
// ---------------------------------------------------------------------------

const NODES: NcNode[] = Array.from(
  { length: 20 },
  (_unused, index): NcNode => ({
    [entityPrimaryKeyProperty]: `n${index}`,
    type: 'person',
    [entityAttributesProperty]: {},
  }),
);
const PAIRS = unorderedPairs(NODES);

/** The realised edge count of each of `DRAWS` topology realisations. */
const topologyDraws = (topology: EdgeTopology, seed = 99): number[] => {
  const streams = createSessionStreams(seed, 0);
  return Array.from(
    { length: DRAWS },
    () =>
      chooseLinkedPairs({
        topology,
        pairs: PAIRS,
        nodeCount: NODES.length,
        streams,
      }).size,
  );
};

const density = (topology: EdgeTopology, seed?: number): number[] =>
  topologyDraws(topology, seed).map((edges) => edges / PAIRS.length);

const meanDegree = (topology: EdgeTopology, seed?: number): number[] =>
  topologyDraws(topology, seed).map((edges) => (2 * edges) / NODES.length);

/**
 * Rounding a metric into a whole number of edges adds a uniform ±½-edge error.
 * Over 190 pairs that is ±1/380 of a density, and its own deviation is
 * (1/190)/√12 ≈ 0.0015 — below every bound here, and named rather than absorbed.
 */
const DENSITY_ROUNDING = 1 / (2 * PAIRS.length);

describe('a declared edge topology realises the distribution it names', () => {
  it('links exactly the constant density it declares', () => {
    const drawn = density({
      metric: 'density',
      distribution: { distribution: 'constant', value: 0.4 },
    });

    // 0.4 × 190 = 76 edges exactly, so there is nothing to round and nothing
    // to average: every realisation is the same.
    expect(new Set(drawn)).toEqual(new Set([0.4]));
  });

  it('spreads a uniform density over its declared window', () => {
    // A uniform on [0.2, 0.6] has mean 0.4 and deviation (0.6 − 0.2)/√12.
    const drawn = density({
      metric: 'density',
      distribution: { distribution: 'uniform', min: 0.2, max: 0.6 },
    });
    const spread = 0.4 / Math.sqrt(12);

    expect(Math.abs(mean(drawn) - 0.4)).toBeLessThan(
      MEAN_TOLERANCE(spread) + DENSITY_ROUNDING,
    );
    expect(Math.abs(deviation(drawn) - spread)).toBeLessThan(
      DEVIATION_TOLERANCE(spread) + DENSITY_ROUNDING,
    );
  });

  it('centres a normal density on its mean', () => {
    const drawn = density({
      metric: 'density',
      distribution: { distribution: 'normal', mean: 0.4, sd: 0.1 },
    });

    // Truncation into 0-1 clips at four deviations, removing ~0.006% of the
    // mass symmetrically enough to leave both statistics inside their bounds.
    expect(Math.abs(mean(drawn) - 0.4)).toBeLessThan(
      MEAN_TOLERANCE(0.1) + DENSITY_ROUNDING,
    );
    expect(Math.abs(deviation(drawn) - 0.1)).toBeLessThan(
      DEVIATION_TOLERANCE(0.1) + DENSITY_ROUNDING,
    );
  });

  it('realises a beta density at the moments it declares', () => {
    // Beta is parameterised by moments precisely so this assertion is possible:
    // mean 0.3 and deviation 0.15 are the numbers an author wrote.
    const drawn = density({
      metric: 'density',
      distribution: { distribution: 'beta', mean: 0.3, sd: 0.15 },
    });

    expect(Math.abs(mean(drawn) - 0.3)).toBeLessThan(
      MEAN_TOLERANCE(0.15) + DENSITY_ROUNDING,
    );
    expect(Math.abs(deviation(drawn) - 0.15)).toBeLessThan(
      DEVIATION_TOLERANCE(0.15) + DENSITY_ROUNDING,
    );
  });

  it('reads a constant mean degree as ties per person', () => {
    // 4 ties per person over 20 people is 40 edges, which the pair set holds.
    const drawn = meanDegree({
      metric: 'meanDegree',
      distribution: { distribution: 'constant', value: 4 },
    });

    expect(new Set(drawn)).toEqual(new Set([4]));
  });

  it('spreads a uniform mean degree over its declared window', () => {
    const drawn = meanDegree({
      metric: 'meanDegree',
      distribution: { distribution: 'uniform', min: 2, max: 6 },
    });
    const spread = 4 / Math.sqrt(12);
    // Rounding to whole edges is ±½ an edge, which is ±1/20 of a mean degree.
    const rounding = 1 / NODES.length;

    expect(Math.abs(mean(drawn) - 4)).toBeLessThan(
      MEAN_TOLERANCE(spread) + rounding,
    );
    expect(Math.abs(deviation(drawn) - spread)).toBeLessThan(
      DEVIATION_TOLERANCE(spread) + rounding,
    );
  });

  it('centres a normal mean degree on its mean', () => {
    const drawn = meanDegree({
      metric: 'meanDegree',
      distribution: { distribution: 'normal', mean: 4, sd: 1 },
    });
    const rounding = 1 / NODES.length;

    expect(Math.abs(mean(drawn) - 4)).toBeLessThan(
      MEAN_TOLERANCE(1) + rounding,
    );
    expect(Math.abs(deviation(drawn) - 1)).toBeLessThan(
      DEVIATION_TOLERANCE(1) + rounding,
    );
  });
});

// ---------------------------------------------------------------------------
// Variable descriptors: option weights and missingness
// ---------------------------------------------------------------------------

const TODAY = '2026-08-14';
const PERSON: EntityScopeRef = { entity: 'node', type: 'person' };

/**
 * `DRAWS` entities generated against one codebook, sharing one generator — as a
 * run of alters on one stage does.
 */
const drawEntities = (
  variables: Record<string, unknown>,
  seed = 11,
): Record<string, VariableValue>[] => {
  const entity = buildEntityConstraints(variables as Variables, TODAY);
  const context: GenerationContext = {
    codebook: {},
    valueGen: new ValueGenerator(seed, TODAY),
    uniqueRegistry: new UniqueRegistry(),
  };

  return Array.from({ length: DRAWS }, (_unused, index) =>
    generateEntityAttributes(entity, context, PERSON, index),
  );
};

const OPTIONS = [
  { label: 'One', value: 1 },
  { label: 'Two', value: 2 },
  { label: 'Three', value: 3 },
];

describe('declared option weights realise as the shares they name', () => {
  it('draws an ordinal in proportion to its weights', () => {
    // Weights 1 : 1 : 8 — an unlisted option carries the schema's default
    // weight of 1 — so the shares are 0.1, 0.1 and 0.8.
    const drawn = drawEntities({
      band: {
        name: 'band',
        type: 'ordinal',
        component: 'LikertScale',
        options: OPTIONS,
        synthetic: { optionWeights: [{ value: 3, weight: 8 }] },
      },
    });

    for (const [value, share] of [
      [1, 0.1],
      [2, 0.1],
      [3, 0.8],
    ] as const) {
      expect(
        Math.abs(shareOf(drawn, (entity) => entity.band === value) - share),
      ).toBeLessThan(PROPORTION_TOLERANCE(share));
    }
  });

  it('draws a single-selection categorical in proportion to its weights', () => {
    // One option per selection, so a selection's only member is the drawn
    // option and the marginal share is the weight share exactly.
    const drawn = drawEntities({
      context: {
        name: 'context',
        type: 'categorical',
        component: 'CheckboxGroup',
        options: [
          { label: 'Family', value: 'family' },
          { label: 'Work', value: 'work' },
        ],
        synthetic: {
          selectionCount: { probabilities: [{ count: 1, probability: 1 }] },
          optionWeights: [{ value: 'work', weight: 3 }],
        },
      },
    });

    // Weights 1 : 3, so a quarter and three quarters.
    const held = (value: string) =>
      shareOf(drawn, (entity) => {
        const selection = entity.context;
        return (
          Array.isArray(selection) &&
          selection.some((member) => member === value)
        );
      });

    expect(Math.abs(held('family') - 0.25)).toBeLessThan(
      PROPORTION_TOLERANCE(0.25),
    );
    expect(Math.abs(held('work') - 0.75)).toBeLessThan(
      PROPORTION_TOLERANCE(0.75),
    );
  });
});

describe('a declared missingProbability realises as the share it names', () => {
  it.each([0.2, 0.5, 0.8])('leaves %s of draws unanswered', (probability) => {
    const drawn = drawEntities({
      age: {
        name: 'age',
        type: 'number',
        component: 'Number',
        validation: { minValue: 18, maxValue: 90 },
        synthetic: {
          distribution: 'uniform',
          min: 18,
          max: 90,
          missingProbability: probability,
        },
      },
    });

    expect(
      Math.abs(
        shareOf(drawn, (entity) => entity.age === undefined) - probability,
      ),
    ).toBeLessThan(PROPORTION_TOLERANCE(probability));
  });

  it('answers every draw where nothing is declared missing', () => {
    const drawn = drawEntities({
      age: {
        name: 'age',
        type: 'number',
        component: 'Number',
        validation: { required: true, minValue: 18, maxValue: 90 },
      },
    });

    expect(shareOf(drawn, (entity) => entity.age === undefined)).toBe(0);
  });
});
