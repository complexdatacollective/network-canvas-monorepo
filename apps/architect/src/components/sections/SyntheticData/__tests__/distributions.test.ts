import { describe, expect, it } from 'vitest';

import {
  DensityDistributionSchema,
  MeanDegreeDistributionSchema,
  SyntheticCountSchema,
} from '@codaco/protocol-validation';
import {
  describeDistributions,
  type SyntheticDistributionSpec,
} from '~/components/Synthetic/schemaIntrospection';
import type { SyntheticDistribution } from '~/components/Synthetic/summaries';

import {
  DISTRIBUTION_FAMILIES,
  DISTRIBUTION_LABELS,
  DISTRIBUTION_PARAMETERS,
  distributionCandidates,
  distributionCentre,
  distributionSpread,
  offeredFamilies,
  PARAMETER_LABELS,
  parameterValue,
  parameterWindow,
  withParameter,
} from '../distributions';
import { asCount, asTopology } from '../stageSynthetic';

const COUNT_WINDOW = { min: 0, max: 100 };
const DENSITY_WINDOW = { min: 0, max: 1 };
const MEAN_DEGREE_WINDOW = { min: 0, max: Number.POSITIVE_INFINITY };

describe('the family inventory', () => {
  it('offers exactly the families the parameter table knows', () => {
    // `DISTRIBUTION_PARAMETERS` is exhaustive over the schema's own family
    // union (the typecheck says so); this is what keeps the ORDERED list used
    // for rendering from drifting away from it.
    expect(DISTRIBUTION_FAMILIES.toSorted()).toEqual(
      Object.keys(DISTRIBUTION_PARAMETERS).toSorted(),
    );
  });

  it('labels every family and every parameter', () => {
    for (const family of DISTRIBUTION_FAMILIES) {
      expect(DISTRIBUTION_LABELS[family]).toBeTruthy();
      for (const parameter of DISTRIBUTION_PARAMETERS[family]) {
        expect(PARAMETER_LABELS[parameter]).toBeTruthy();
      }
    }
  });
});

describe('reading a distribution', () => {
  it('reads a constant’s value as its centre and no spread', () => {
    const constant: SyntheticDistribution = {
      distribution: 'constant',
      value: 4,
    };
    expect(distributionCentre(constant, COUNT_WINDOW)).toBe(4);
    expect(distributionSpread(constant, COUNT_WINDOW)).toBe(0);
  });

  it('reads a uniform’s midpoint and half-width', () => {
    const uniform: SyntheticDistribution = {
      distribution: 'uniform',
      min: 2,
      max: 10,
    };
    expect(distributionCentre(uniform, COUNT_WINDOW)).toBe(6);
    expect(distributionSpread(uniform, COUNT_WINDOW)).toBe(4);
  });

  it('reads mean and sd where the family carries them', () => {
    const normal: SyntheticDistribution = {
      distribution: 'normal',
      mean: 8,
      sd: 3,
    };
    expect(distributionCentre(normal, COUNT_WINDOW)).toBe(8);
    expect(distributionSpread(normal, COUNT_WINDOW)).toBe(3);
    expect(parameterValue(normal, 'mean')).toBe(8);
    expect(parameterValue(normal, 'value')).toBeUndefined();
  });
});

describe('parameter windows', () => {
  const uniform: SyntheticDistribution = {
    distribution: 'uniform',
    min: 2,
    max: 10,
  };

  const specFor = (
    schema: unknown,
    family: string,
  ): SyntheticDistributionSpec | undefined =>
    describeDistributions(schema).find(
      (candidate) => candidate.family === family,
    );

  it('stops a minimum crossing its own maximum', () => {
    expect(
      parameterWindow(
        uniform,
        'min',
        COUNT_WINDOW,
        specFor(SyntheticCountSchema, 'uniform'),
      ),
    ).toEqual({
      min: 0,
      max: 10,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: true,
    });
  });

  it('stops a maximum crossing its own minimum', () => {
    expect(
      parameterWindow(
        uniform,
        'max',
        COUNT_WINDOW,
        specFor(SyntheticCountSchema, 'uniform'),
      ),
    ).toEqual({
      min: 2,
      max: 100,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: true,
    });
  });

  it('gives a spread no direction and no ceiling', () => {
    expect(
      parameterWindow(
        { distribution: 'normal', mean: 8, sd: 3 },
        'sd',
        COUNT_WINDOW,
        specFor(SyntheticCountSchema, 'normal'),
      ),
    ).toEqual({
      min: 0,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('holds a count’s own value to whole numbers inside the stage window', () => {
    // `populationInt`: the value a constant count returns IS a population, so
    // it is integral and bounded — and the stage's own window narrows it.
    expect(
      parameterWindow(
        { distribution: 'constant', value: 4 },
        'value',
        { min: 2, max: 6 },
        specFor(SyntheticCountSchema, 'constant'),
      ),
    ).toEqual({
      min: 2,
      max: 6,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: true,
    });
  });

  it('leaves a count’s mean fractional, and without a floor', () => {
    // The count schema bounds a normal's mean ABOVE only: `normal(mean 5.5,
    // sd 2.5)` is a legal count, and a negative mean with spread is the
    // sanctioned "usually none, occasionally a few". A blanket integral claim
    // about "the count field" made both untypeable.
    expect(
      parameterWindow(
        { distribution: 'normal', mean: 5.5, sd: 2.5 },
        'mean',
        COUNT_WINDOW,
        specFor(SyntheticCountSchema, 'normal'),
      ),
    ).toEqual({
      max: 100,
      exclusiveMin: false,
      exclusiveMax: false,
      integer: false,
    });
  });

  it('leaves a poisson count’s mean fractional', () => {
    expect(
      parameterWindow(
        { distribution: 'poisson', mean: 2.5 },
        'mean',
        COUNT_WINDOW,
        specFor(SyntheticCountSchema, 'poisson'),
      ),
    ).toMatchObject({ integer: false, min: 0, max: 100 });
  });

  it('keeps a beta density’s mean strictly inside its endpoints', () => {
    expect(
      parameterWindow(
        { distribution: 'beta', mean: 0.3, sd: 0.1 },
        'mean',
        DENSITY_WINDOW,
        specFor(DensityDistributionSchema, 'beta'),
      ),
    ).toEqual({
      min: 0,
      max: 1,
      exclusiveMin: true,
      exclusiveMax: true,
      integer: false,
    });
  });

  it('leaves a mean degree’s mean unbounded, as its schema does', () => {
    expect(
      parameterWindow(
        { distribution: 'normal', mean: 3, sd: 1 },
        'mean',
        MEAN_DEGREE_WINDOW,
        specFor(MeanDegreeDistributionSchema, 'normal'),
      ),
    ).toEqual({ exclusiveMin: false, exclusiveMax: false, integer: false });
  });
});

describe('the families one field offers', () => {
  it('offers a count only the families a count admits', () => {
    expect(
      offeredFamilies(describeDistributions(SyntheticCountSchema)),
    ).toEqual(['constant', 'uniform', 'poisson', 'normal']);
  });

  it('offers a density its own set, beta included and log-normal not', () => {
    expect(
      offeredFamilies(describeDistributions(DensityDistributionSchema)),
    ).toEqual(['constant', 'uniform', 'normal', 'beta']);
  });

  it('offers a mean degree no beta, having no ceiling to put one under', () => {
    expect(
      offeredFamilies(describeDistributions(MeanDegreeDistributionSchema)),
    ).toEqual(['constant', 'uniform', 'normal']);
  });
});

describe('candidates for a newly chosen family', () => {
  const from: SyntheticDistribution = {
    distribution: 'normal',
    mean: 8.4,
    sd: 3.2,
  };

  it('offers a whole-number seed the count schema accepts', () => {
    // A count is integral, so the raw seed is refused and the rounded one is
    // what a caller writes. The schema is the judge of that, here as in the
    // editor.
    const candidates = distributionCandidates('constant', from, COUNT_WINDOW);
    const accepted = candidates.filter(
      (candidate) => asCount(candidate) !== undefined,
    );

    expect(candidates.length).toBeGreaterThan(1);
    expect(accepted).not.toHaveLength(0);
    expect(asCount(accepted[0])).toEqual({
      distribution: 'constant',
      value: 8,
    });
  });

  it('keeps the author’s centre and spread for a continuous field', () => {
    const [first] = distributionCandidates(
      'uniform',
      { distribution: 'normal', mean: 0.4, sd: 0.1 },
      DENSITY_WINDOW,
    );

    expect(
      asTopology({ metric: 'density', distribution: first }),
    ).toMatchObject({
      distribution: { distribution: 'uniform', min: 0.3, max: 0.5 },
    });
  });

  it('clamps a seed into the field’s window', () => {
    const [first] = distributionCandidates(
      'uniform',
      { distribution: 'normal', mean: 0.9, sd: 0.5 },
      DENSITY_WINDOW,
    );

    expect(first).toMatchObject({ distribution: 'uniform', min: 0.4, max: 1 });
  });

  it('offers a beta the schema accepts, falling back to no spread', () => {
    // A beta's spread is bounded by its own mean, so a carried-over spread can
    // be inadmissible. Some candidate must still be acceptable, or choosing
    // the family would do nothing at all.
    const candidates = distributionCandidates(
      'beta',
      { distribution: 'normal', mean: 0.5, sd: 0.9 },
      DENSITY_WINDOW,
    );
    const accepted = candidates.filter(
      (candidate) =>
        asTopology({ metric: 'density', distribution: candidate }) !==
        undefined,
    );

    expect(accepted).not.toHaveLength(0);
  });

  it('offers a mean degree seed inside an open-topped window', () => {
    const candidates = distributionCandidates(
      'uniform',
      { distribution: 'normal', mean: 3, sd: 1 },
      MEAN_DEGREE_WINDOW,
    );
    const accepted = candidates.filter(
      (candidate) =>
        asTopology({ metric: 'meanDegree', distribution: candidate }) !==
        undefined,
    );

    expect(accepted).not.toHaveLength(0);
    expect(accepted[0]).toMatchObject({ min: 2, max: 4 });
  });
});

describe('editing one parameter', () => {
  it('replaces it and leaves the rest alone', () => {
    expect(
      withParameter({ distribution: 'normal', mean: 8, sd: 3 }, 'sd', 1),
    ).toEqual({ distribution: 'normal', mean: 8, sd: 1 });
  });
});
