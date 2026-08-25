import { describe, expect, it } from 'vitest';

import type { EdgeTopology } from '../index.ts';
import {
  topologyDrawWindow,
  topologyRealisedEdgeCeiling,
  topologyTargetBounds,
  topologyTargetFromDraw,
} from '../topology.ts';

type DensityOf<M extends EdgeTopology['metric']> = Extract<
  EdgeTopology,
  { metric: M }
>['distribution'];

const density = (distribution: DensityOf<'density'>): EdgeTopology => ({
  metric: 'density',
  distribution,
});

const meanDegree = (distribution: DensityOf<'meanDegree'>): EdgeTopology => ({
  metric: 'meanDegree',
  distribution,
});

describe('topologyTargetBounds', () => {
  it('allows at most one edge per available pair', () => {
    expect(topologyTargetBounds(45)).toEqual({ min: 0, max: 45 });
  });

  it('has nothing to offer a network with no pairs', () => {
    expect(topologyTargetBounds(0)).toEqual({ min: 0, max: 0 });
  });
});

describe('topologyTargetFromDraw', () => {
  it('reads a density as a proportion of the available pairs', () => {
    expect(
      topologyTargetFromDraw(
        density({ distribution: 'constant', value: 0.4 }),
        0.4,
        45,
        10,
      ),
    ).toBe(18);
  });

  it('reads a mean degree as ties per person, each shared by two', () => {
    expect(
      topologyTargetFromDraw(
        meanDegree({ distribution: 'constant', value: 3 }),
        3,
        45,
        10,
      ),
    ).toBe(15);
  });

  it('will not ask for more edges than there are pairs', () => {
    // A mean degree is unbounded above by design: "everybody knows twenty
    // people" is sayable in a network of five.
    expect(
      topologyTargetFromDraw(
        meanDegree({ distribution: 'constant', value: 20 }),
        20,
        10,
        5,
      ),
    ).toBe(10);
  });

  it('will not ask for a negative number of edges', () => {
    expect(
      topologyTargetFromDraw(
        density({ distribution: 'normal', mean: 0.2, sd: 0.3 }),
        -0.5,
        45,
        10,
      ),
    ).toBe(0);
  });
});

describe('topologyDrawWindow', () => {
  it('reads an unstated density as any proportion at all', () => {
    expect(topologyDrawWindow(density({ distribution: 'uniform' }))).toEqual({
      min: 0,
      max: 1,
    });
  });

  it('leaves a mean degree unbounded above and non-negative below', () => {
    expect(
      topologyDrawWindow(
        meanDegree({ distribution: 'normal', mean: 2, sd: 1 }),
      ),
    ).toEqual({ min: 0, max: Number.POSITIVE_INFINITY });
  });

  it('narrows to what the declaration states', () => {
    expect(
      topologyDrawWindow(
        density({ distribution: 'uniform', min: 0.25, max: 0.75 }),
      ),
    ).toEqual({ min: 0.25, max: 0.75 });
  });

  it('never widens past the metric’s own domain', () => {
    // The schema refuses these, so nothing authored reaches here holding them;
    // the intersection is what makes the window safe to draw against anyway.
    expect(
      topologyDrawWindow(
        density({ distribution: 'normal', mean: 0.5, sd: 1, min: -2, max: 4 }),
      ),
    ).toEqual({ min: 0, max: 1 });
  });

  it('gives a family with no bounds of its own the whole domain', () => {
    expect(
      topologyDrawWindow(density({ distribution: 'beta', mean: 0.3, sd: 0.1 })),
    ).toEqual({ min: 0, max: 1 });
  });
});

describe('topologyRealisedEdgeCeiling', () => {
  it('holds a constant density to its own value, not the domain ceiling', () => {
    // A constant draw is returned untruncated, so its value IS its largest:
    // density 0.1 over 45 pairs selects five on the luckiest realisation.
    expect(
      topologyRealisedEdgeCeiling(
        {
          metric: 'density',
          distribution: { distribution: 'constant', value: 0.1 },
        },
        45,
        10,
      ),
    ).toBe(5);
  });

  it('caps a bounded family at its truncation window', () => {
    expect(
      topologyRealisedEdgeCeiling(
        {
          metric: 'density',
          distribution: {
            distribution: 'normal',
            mean: 0.2,
            sd: 0.1,
            max: 0.5,
          },
        },
        40,
        10,
      ),
    ).toBe(20);
  });

  it('resolves an open mean degree to the whole pair set', () => {
    expect(
      topologyRealisedEdgeCeiling(
        {
          metric: 'meanDegree',
          distribution: { distribution: 'normal', mean: 3, sd: 1 },
        },
        45,
        10,
      ),
    ).toBe(45);
  });
});
