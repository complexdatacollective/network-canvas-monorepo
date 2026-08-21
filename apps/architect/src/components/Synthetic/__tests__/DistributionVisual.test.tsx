import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DistributionVisual, distributionMath } from '../DistributionVisual';
import type { SyntheticDistribution, SyntheticWindow } from '../summaries';

/**
 * The static distribution sketch. Two layers: a rendering smoke over every
 * family the schema admits (curves for the continuous, bars for the discrete,
 * labelled endpoints, hidden from assistive technology), and a numeric hold
 * on the density/mass functions themselves — a rendered path cannot witness a
 * wrong pdf, so the maths is asserted against closed-form values directly.
 */

const renderVisual = (
  distribution: SyntheticDistribution,
  window: SyntheticWindow,
) => {
  const { container } = render(
    <DistributionVisual distribution={distribution} window={window} />,
  );
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('nothing rendered');
  return root;
};

const CURVE_CASES: [string, SyntheticDistribution, SyntheticWindow][] = [
  ['normal', { distribution: 'normal', mean: 8, sd: 3 }, { min: 0, max: 100 }],
  [
    'lognormal',
    { distribution: 'lognormal', mean: 2, sd: 1 },
    { min: 0, max: 20 },
  ],
  ['beta', { distribution: 'beta', mean: 0.3, sd: 0.15 }, { min: 0, max: 1 }],
  ['uniform', { distribution: 'uniform', min: 2, max: 6 }, { min: 0, max: 10 }],
];

describe('rendering', () => {
  it.each(CURVE_CASES)(
    'sketches a %s as a curve with an area fill',
    (_family, distribution, window) => {
      const root = renderVisual(distribution, window);

      expect(root).toHaveAttribute('aria-hidden', 'true');
      const svg = root.querySelector('svg');
      expect(svg).not.toBeNull();
      // One area fill and one stroked line.
      expect(svg?.querySelectorAll('path')).toHaveLength(2);
      expect(svg?.querySelectorAll('rect')).toHaveLength(0);
    },
  );

  it('sketches a poisson as one bar per whole count in the window', () => {
    const root = renderVisual(
      { distribution: 'poisson', mean: 3 },
      { min: 0, max: 8 },
    );

    // Counts 0 through 8 inclusive.
    expect(root.querySelectorAll('rect')).toHaveLength(9);
    expect(root.querySelectorAll('path')).toHaveLength(0);
  });

  it('sketches a constant as a single bar', () => {
    const root = renderVisual(
      { distribution: 'constant', value: 5 },
      { min: 0, max: 10 },
    );

    expect(root.querySelectorAll('rect')).toHaveLength(1);
  });

  it('sketches a zero-deviation normal as a spike at its mean', () => {
    const root = renderVisual(
      { distribution: 'normal', mean: 4, sd: 0 },
      { min: 0, max: 10 },
    );

    expect(root.querySelectorAll('rect')).toHaveLength(1);
    expect(root.querySelectorAll('path')).toHaveLength(0);
  });

  it('draws a window with no width at all', () => {
    // A stage pinned to one population (`minNodes === maxNodes`) has a window
    // whose ends meet. Mapping a value onto such a window divides by its
    // width, so an unguarded sketch emits NaN in every coordinate and the SVG
    // draws nothing — beside fields that are perfectly valid.
    const cases: [SyntheticDistribution, SyntheticWindow][] = [
      [
        { distribution: 'constant', value: 5 },
        { min: 5, max: 5 },
      ],
      [
        { distribution: 'normal', mean: 5, sd: 2 },
        { min: 5, max: 5 },
      ],
      [
        { distribution: 'uniform', min: 5, max: 5 },
        { min: 5, max: 5 },
      ],
      [
        { distribution: 'poisson', mean: 5 },
        { min: 5, max: 5 },
      ],
    ];

    for (const [distribution, window] of cases) {
      const root = renderVisual(distribution, window);
      const marks = [
        ...root.querySelectorAll('rect'),
        ...root.querySelectorAll('path'),
      ];

      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        for (const attribute of ['x', 'y', 'width', 'height', 'd']) {
          expect(mark.getAttribute(attribute) ?? '').not.toMatch(/NaN/);
        }
      }
    }
  });

  it('labels the window endpoints', () => {
    const root = renderVisual(
      { distribution: 'normal', mean: 8, sd: 3 },
      { min: 0, max: 100 },
    );

    const labels = [...root.querySelectorAll('span')].map(
      (span) => span.textContent,
    );
    expect(labels).toEqual(['0', '100']);
  });

  it('labels an open endpoint as infinite and still draws a finite sketch', () => {
    // A mean degree's window has no ceiling; the sketch picks a finite span
    // to draw but the label tells the truth about the window.
    const root = renderVisual(
      { distribution: 'normal', mean: 3, sd: 1 },
      { min: 0, max: Number.POSITIVE_INFINITY },
    );

    const labels = [...root.querySelectorAll('span')].map(
      (span) => span.textContent,
    );
    expect(labels).toEqual(['0', '∞']);
    expect(root.querySelectorAll('path')).toHaveLength(2);
  });

  it('exposes nothing to assistive technology', () => {
    const root = renderVisual(
      { distribution: 'poisson', mean: 3 },
      { min: 0, max: 8 },
    );

    // The numeric fields are the accessible representation; the sketch and
    // its labels are hidden wholesale.
    expect(root.closest('[aria-hidden="true"]')).toBe(root);
    expect(root.querySelector('svg')).toHaveAttribute('role', 'presentation');
  });
});

describe('distribution mathematics', () => {
  const { betaPdf, logGamma, lognormalPdf, normalPdf, poissonPmf } =
    distributionMath;

  it('computes log-gamma to closed-form values', () => {
    // Γ(5) = 4! = 24; Γ(0.5) = √π.
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
    expect(logGamma(1)).toBeCloseTo(0, 10);
  });

  it('computes the standard normal density', () => {
    expect(normalPdf(0, 0, 1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    // Symmetric about the mean.
    expect(normalPdf(6, 8, 3)).toBeCloseTo(normalPdf(10, 8, 3), 12);
  });

  it('poisson masses sum to one', () => {
    let total = 0;
    for (let k = 0; k <= 60; k += 1) total += poissonPmf(k, 4);
    expect(total).toBeCloseTo(1, 8);
    expect(poissonPmf(0, 0)).toBe(1);
    expect(poissonPmf(1, 0)).toBe(0);
  });

  it('the beta density integrates to one and peaks between its bounds', () => {
    const mean = 0.3;
    const sd = 0.15;
    const steps = 4000;
    let integral = 0;
    for (let index = 0; index < steps; index += 1) {
      const x = (index + 0.5) / steps;
      integral += betaPdf(x, mean, sd) / steps;
    }
    expect(integral).toBeCloseTo(1, 3);
    expect(betaPdf(0, mean, sd)).toBe(0);
    expect(betaPdf(1, mean, sd)).toBe(0);
  });

  it('the lognormal density realises the declared moments', () => {
    // The engine reads the schema's mean/sd as the distribution's OWN
    // moments (method of moments); the density must agree.
    const mean = 2;
    const sd = 1;
    const steps = 20000;
    const upper = 40;
    let mass = 0;
    let firstMoment = 0;
    for (let index = 0; index < steps; index += 1) {
      const x = ((index + 0.5) / steps) * upper;
      const density = lognormalPdf(x, mean, sd);
      mass += (density * upper) / steps;
      firstMoment += (x * density * upper) / steps;
    }
    expect(mass).toBeCloseTo(1, 3);
    expect(firstMoment).toBeCloseTo(mean, 2);
    expect(lognormalPdf(0, mean, sd)).toBe(0);
  });
});
