import type * as ChartsReact from '@tanstack/charts/react';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { posthog } from '~/analytics';

import { DistributionVisual, distributionMath } from '../DistributionVisual';
import type { SyntheticDistribution, SyntheticWindow } from '../summaries';

/**
 * The static distribution sketch, drawn by TanStack Charts (spec revision 2,
 * item 2). Four layers: a rendering smoke over every family the schema admits
 * (an area under a line for the continuous families, bars for the discrete
 * ones, labelled endpoints, hidden and unfocusable), a positional hold that
 * the chart is drawn over the SCHEMA'S WINDOW rather than over its own data,
 * the container-tracking and no-motion contracts, and a numeric hold on the
 * density/mass functions themselves — a rendered path cannot witness a wrong
 * pdf, so the maths is asserted against closed-form values directly.
 *
 * Assertions reach for the chart's own scene structure — the `ts-chart__*`
 * groups it paints marks into, and the `viewBox` it lays them out in — never
 * for the coordinates it chose. `.ts-chart__bar rect` rather than `rect`,
 * because a clipped chart also emits a `<clipPath><rect>` that is geometry,
 * not a mark.
 */

/** Lets one test make the chart component throw the way an alpha might. */
const chartControl = vi.hoisted(() => ({ failing: false }));

vi.mock('@tanstack/charts/react', async (importOriginal) => {
  const actual = await importOriginal<typeof ChartsReact>();
  return {
    ...actual,
    Chart: (props: Parameters<typeof actual.Chart>[0]) => {
      if (chartControl.failing) {
        throw new Error('this mark could not be laid out');
      }
      return createElement(actual.Chart, props);
    },
  };
});

afterEach(() => {
  chartControl.failing = false;
  vi.restoreAllMocks();
});

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

const areaPaths = (root: HTMLElement) =>
  root.querySelectorAll('.ts-chart__area path');
const linePaths = (root: HTMLElement) =>
  root.querySelectorAll('.ts-chart__line path');
const barRects = (root: HTMLElement) =>
  root.querySelectorAll('.ts-chart__bar rect');

/** The width the chart laid its scene out in, read from its own `viewBox`. */
const plotWidth = (root: HTMLElement): number => {
  const viewBox = root.querySelector('svg')?.getAttribute('viewBox');
  const width = Number(viewBox?.split(' ')[2]);
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`no usable viewBox: ${String(viewBox)}`);
  }
  return width;
};

/**
 * Where each bar sits across the plot, as a fraction of its width. The
 * fraction is what the window means: a value at the window's midpoint belongs
 * at 0.5 however many pixels the chart happens to have been given.
 */
const barPositions = (root: HTMLElement): number[] => {
  const width = plotWidth(root);
  return [...barRects(root)].map((bar) => {
    const x = Number(bar.getAttribute('x'));
    const barWidth = Number(bar.getAttribute('width'));
    return (x + barWidth / 2) / width;
  });
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
    'sketches a %s as an area under a line',
    (_family, distribution, window) => {
      const root = renderVisual(distribution, window);

      expect(root).toHaveAttribute('aria-hidden', 'true');
      // One filled area, one stroked outline, and no bars anywhere.
      expect(areaPaths(root)).toHaveLength(1);
      expect(linePaths(root)).toHaveLength(1);
      expect(barRects(root)).toHaveLength(0);
    },
  );

  it('sketches a poisson as one bar per whole count in the window', () => {
    const root = renderVisual(
      { distribution: 'poisson', mean: 3 },
      { min: 0, max: 8 },
    );

    // Counts 0 through 8 inclusive.
    expect(barRects(root)).toHaveLength(9);
    expect(areaPaths(root)).toHaveLength(0);
    expect(linePaths(root)).toHaveLength(0);
  });

  it('sketches a constant as a single spike at its value', () => {
    const root = renderVisual(
      { distribution: 'constant', value: 5 },
      { min: 0, max: 10 },
    );

    expect(barRects(root)).toHaveLength(1);
    // Halfway along a window of 0-10, because the chart is drawn over the
    // WINDOW. A scale left to infer its domain from the single datum would
    // put this spike in the middle of any window at all.
    expect(barPositions(root)[0]).toBeCloseTo(0.5, 2);
  });

  it('sketches a zero-deviation normal as a spike at its mean', () => {
    const root = renderVisual(
      { distribution: 'normal', mean: 4, sd: 0 },
      { min: 0, max: 10 },
    );

    expect(barRects(root)).toHaveLength(1);
    expect(barPositions(root)[0]).toBeCloseTo(0.4, 2);
    expect(areaPaths(root)).toHaveLength(0);
  });

  it('spreads a poisson comb across the window it was given', () => {
    // The same distribution over twice the window occupies half the plot:
    // proof that the drawn axis is the schema's window and not the data's
    // own extent, which is identical in both of these.
    const narrow = renderVisual(
      { distribution: 'poisson', mean: 2, max: 4 },
      { min: 0, max: 4 },
    );
    const wide = renderVisual(
      { distribution: 'poisson', mean: 2, max: 4 },
      { min: 0, max: 8 },
    );

    expect(barPositions(narrow).at(-1)).toBeCloseTo(1, 2);
    expect(barPositions(wide).at(-1)).toBeCloseTo(0.5, 2);
  });

  it('draws a window with no width at all', () => {
    // A stage pinned to one population (`minNodes === maxNodes`) has a window
    // whose ends meet. A linear scale over a zero-width domain has no defined
    // mapping, so an unguarded sketch emits NaN in every coordinate and draws
    // nothing — beside fields that are perfectly valid.
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
        ...barRects(root),
        ...areaPaths(root),
        ...linePaths(root),
        ...root.querySelectorAll('.ts-chart__rule line'),
      ];

      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        for (const attribute of [
          'x',
          'y',
          'width',
          'height',
          'd',
          'x1',
          'x2',
          'y1',
          'y2',
        ]) {
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
    expect(areaPaths(root)).toHaveLength(1);
    expect(linePaths(root)).toHaveLength(1);
  });
});

describe('layout and motion', () => {
  it('fills its container and holds its shape rather than fixing a width', () => {
    const root = renderVisual(
      { distribution: 'normal', mean: 8, sd: 3 },
      { min: 0, max: 100 },
    );

    const host = root.querySelector<HTMLElement>('.ts-chart-host');
    expect(host).not.toBeNull();
    // The chart takes whatever width its container has and derives its
    // height from that, so the sketch tracks a resizing editor pane instead
    // of sitting at some pixel size chosen here.
    expect(host?.style.width).toBe('100%');
    expect(host?.style.aspectRatio).not.toBe('');
    expect(host?.style.height).toBe('');
  });

  it('redraws immediately instead of animating between shapes', () => {
    // A shape is not a state change, so nothing here may tween — including
    // for a reader who has asked for reduced motion. If the chart's own
    // animation were enabled, this commit would still be showing the old
    // geometry while a frame loop walked it to the new one.
    const { container, rerender } = render(
      <DistributionVisual
        distribution={{ distribution: 'normal', mean: 2, sd: 1 }}
        window={{ min: 0, max: 10 }}
      />,
    );
    const pathOf = () =>
      container.querySelector('.ts-chart__line path')?.getAttribute('d');
    const before = pathOf();

    rerender(
      <DistributionVisual
        distribution={{ distribution: 'normal', mean: 8, sd: 1 }}
        window={{ min: 0, max: 10 }}
      />,
    );

    expect(before).toBeTruthy();
    expect(pathOf()).not.toBe(before);
  });
});

describe('assistive technology', () => {
  it('exposes nothing to assistive technology', () => {
    const root = renderVisual(
      { distribution: 'poisson', mean: 3 },
      { min: 0, max: 8 },
    );

    // The numeric fields are the accessible representation; the sketch and
    // its labels are hidden wholesale.
    expect(root.closest('[aria-hidden="true"]')).toBe(root);
    expect(root).toHaveAttribute('role', 'presentation');
  });

  it('leaves nothing inside the hidden sketch in the tab order', () => {
    // The chart makes its surface focusable by default; a focusable element
    // inside an `aria-hidden` subtree is a stop on the keyboard path that
    // announces nothing when it is reached.
    const root = renderVisual(
      { distribution: 'normal', mean: 8, sd: 3 },
      { min: 0, max: 100 },
    );

    expect(
      root.querySelectorAll('[tabindex]:not([tabindex="-1"])'),
    ).toHaveLength(0);
  });
});

describe('when the chart cannot draw', () => {
  it('keeps the endpoint labels and reports the failure', () => {
    // React logs a caught render error of its own; keep the run readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reported = vi
      .spyOn(posthog, 'captureException')
      .mockImplementation(() => undefined);
    chartControl.failing = true;

    const root = renderVisual(
      { distribution: 'normal', mean: 8, sd: 3 },
      { min: 0, max: 100 },
    );

    // The sketch is decoration; the numbers beside it are the content, and a
    // throw from the chart must not take them — or the editor — with it.
    expect(
      [...root.querySelectorAll('span')].map((span) => span.textContent),
    ).toEqual(['0', '100']);
    expect(root.querySelector('svg')).toBeNull();
    // Degrading is not the same as hiding: the alpha's failure is reported
    // the same way every other caught error in Architect is.
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'this mark could not be laid out' }),
    );
  });

  it('tries again on the next edit', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(posthog, 'captureException').mockImplementation(() => undefined);
    chartControl.failing = true;

    const { container, rerender } = render(
      <DistributionVisual
        distribution={{ distribution: 'normal', mean: 8, sd: 3 }}
        window={{ min: 0, max: 100 }}
      />,
    );
    expect(container.querySelector('svg')).toBeNull();

    // One combination the library cannot draw must not blank the sketch for
    // the rest of the session — otherwise the researcher has to leave the
    // editor and come back to see any shape at all again.
    chartControl.failing = false;
    rerender(
      <DistributionVisual
        distribution={{ distribution: 'normal', mean: 9, sd: 3 }}
        window={{ min: 0, max: 100 }}
      />,
    );

    expect(container.querySelectorAll('.ts-chart__line path')).toHaveLength(1);
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
