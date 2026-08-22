import { areaY, barY, defineChart, lineY, ruleY } from '@tanstack/charts';
import { Chart } from '@tanstack/charts/react';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { Component, type ReactNode, useMemo } from 'react';

import { ensureError } from '@codaco/shared-consts';
import { posthog } from '~/analytics';
import { cx } from '~/utils/cva';

import {
  formatWindowEndpoint,
  type SyntheticDistribution,
  type SyntheticWindow,
} from './summaries';

/**
 * A static sketch of a distribution's shape over its valid window: a curve
 * for the continuous families (normal, lognormal, beta, uniform), bars for
 * the discrete ones (poisson, constant), with the window endpoints labelled
 * (spec, "Distribution visual"; revision 2 item 2 moves the rendering onto
 * TanStack Charts).
 *
 * Decorative by contract: the numeric fields beside it are the accessible
 * representation, so the whole component is `aria-hidden` and the chart's own
 * keyboard, pointer, focus, and tooltip behaviours are switched off — a
 * focusable element inside an `aria-hidden` subtree is a trap, not a feature.
 * No animation either: a distribution's shape is not a state change, and the
 * preview popup is the try-it path for realised draws.
 *
 * The WINDOW is the schema's own valid window for the field (a count's
 * resolved bounds, `topologyDrawWindow`'s result, a validation range, 0-1
 * for probabilities) — the same window the sibling fields enforce, imported
 * by the caller from `@codaco/protocol-validation`, never restated here
 * (spec governing rule 1). Densities are drawn unnormalised and scaled to the
 * tallest sampled point, so the vertical axis carries no numbers to restate.
 *
 * This module computes only DATA: sampled densities and masses in the units
 * the author typed. Every pixel — the plot rectangle, the scales, the paths —
 * belongs to the chart, which re-lays-out whenever its container's width
 * changes. The numeric literals below are presentation (sample resolution,
 * aspect, mark thickness, and how far past the mean an OPEN window is
 * sketched) and shape pixels only; generation reads nothing from this module.
 */

export type DistributionVisualProps = {
  /** The resolved distribution to sketch, as the schema types it. */
  distribution: SyntheticDistribution;
  /** The field's valid window; either side may be infinite (open). */
  window: SyntheticWindow;
  className?: string;
};

// --- presentation geometry ---------------------------------------------------

const SAMPLES = 96;
/** Width-to-height of the plot; the chart scales to its container at this ratio. */
const CHART_ASPECT = 240 / 72;
/**
 * The width the chart lays out at before it has measured its container — on
 * the server, on the first client paint, and in any environment without a
 * usable `ResizeObserver`. The measured width supersedes it immediately.
 */
const INITIAL_WIDTH = 240;
/** How many standard deviations past the mean an open window is sketched to. */
const OPEN_WINDOW_SPREADS = 4;
/**
 * The density axis is unlabelled and normalised to a peak of 1. The ceiling
 * clears the tallest point so a peak is never clipped; the floor opens a hair
 * of space under the shape for the baseline rule to sit in.
 */
const DENSITY_CEILING = 1.06;
const DENSITY_FLOOR = -0.04;
/** A poisson comb's bars, capped so a sparse window does not draw slabs. */
const BAR_THICKNESS = 10;
/** A single-valued family (constant, zero-spread) drawn as a spike this wide. */
const SPIKE_THICKNESS = 4;
const BAR_RADIUS = 1;
const LINE_WIDTH = 1.5;

// --- design tokens -----------------------------------------------------------

/**
 * Marks are painted with the theme's own custom properties rather than the
 * chart library's palette tokens, so a theme change moves this sketch with
 * every other surface and no hex ever appears here.
 */
const ACCENT = 'var(--color-primary)';
const MUTED = 'var(--color-text)';
const AREA_OPACITY = 0.15;
const BAR_OPACITY = 0.6;
const BASELINE_OPACITY = 0.3;

/**
 * Everything the chart would otherwise do on its own. `guides: false` drops
 * both axes and their implicit margins (the endpoint labels below the plot
 * are the only annotation this sketch carries); `clip` keeps an edge bar
 * inside the plot rather than painting past it; the interaction options make
 * the surface inert and unfocusable; `svgAnimation: false` states the
 * no-motion contract rather than relying on it being the library's default.
 */
const INERT_CHART = {
  guides: false,
  margin: 0,
  clip: true,
  focus: false,
  pointer: false,
  keyboard: false,
  tooltip: false,
  svgAnimation: false,
} as const;

/**
 * Named for the same reason the wrapper is `aria-hidden`: the chart requires
 * an accessible name, and a whole sentence is the only kind of string that
 * can be localised later. Nothing reads it — the subtree is hidden.
 */
const CHART_LABEL = 'The shape of this distribution across its valid range.';

// --- distribution mathematics ------------------------------------------------

/**
 * Natural log of the gamma function via the Lanczos approximation (g = 7,
 * n = 9 coefficients — the standard published set), accurate to ~15 digits
 * for positive arguments. Used so beta densities and poisson masses are
 * computed in log space, where the factorials and powers that overflow a
 * double cancel before exponentiation.
 */
const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

const logGamma = (x: number): number => {
  // Reflection for the left half-plane keeps the approximation in its
  // accurate region; the visual only ever asks for positive arguments.
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const shifted = x - 1;
  let sum = LANCZOS_COEFFICIENTS[0] as number;
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index += 1) {
    sum += (LANCZOS_COEFFICIENTS[index] as number) / (shifted + index);
  }
  const t = shifted + LANCZOS_G + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (shifted + 0.5) * Math.log(t) -
    t +
    Math.log(sum)
  );
};

/** Normal density: exp(−(x−μ)² / 2σ²) / (σ√2π). */
const normalPdf = (x: number, mean: number, sd: number): number =>
  Math.exp(-((x - mean) ** 2) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));

/**
 * Lognormal density parameterised by the distribution's OWN mean and sd —
 * the reading the engine's sampler takes of the schema's fields — converted
 * to log-space parameters by the method of moments: σ² = ln(1 + sd²/mean²),
 * μ = ln(mean) − σ²/2. Density is normalPdf(ln x; μ, σ) / x for x > 0.
 */
const lognormalPdf = (x: number, mean: number, sd: number): number => {
  if (x <= 0) return 0;
  const variance = Math.log(1 + (sd * sd) / (mean * mean));
  const mu = Math.log(mean) - variance / 2;
  return normalPdf(Math.log(x), mu, Math.sqrt(variance)) / x;
};

/**
 * Beta density parameterised by mean and sd, converted to shape parameters
 * exactly as the engine's sampler converts them: ν = mean(1−mean)/sd² − 1,
 * α = mean·ν, β = (1−mean)·ν (positive by the schema's own sd² < mean(1−mean)
 * refinement). Computed in log space with the stable log-gamma above:
 * ln f(x) = (α−1)ln x + (β−1)ln(1−x) − [lnΓ(α) + lnΓ(β) − lnΓ(α+β)].
 * Zero at and outside the endpoints; a shape below 1 diverges as x approaches
 * its endpoint, which scaling-to-tallest-sample renders as a curve hugging
 * that edge.
 */
const betaPdf = (x: number, mean: number, sd: number): number => {
  if (x <= 0 || x >= 1) return 0;
  const nu = (mean * (1 - mean)) / (sd * sd) - 1;
  if (nu <= 0) return 0;
  const alpha = mean * nu;
  const beta = (1 - mean) * nu;
  const logBeta = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);
  return Math.exp(
    (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logBeta,
  );
};

/**
 * Poisson mass at integer k: exp(k·ln λ − λ − lnΓ(k+1)), the log-space form
 * of λᵏe^(−λ)/k!. A zero mean has its whole mass at zero.
 */
const poissonPmf = (k: number, mean: number): number => {
  if (mean === 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(mean) - mean - logGamma(k + 1));
};

// --- window resolution -------------------------------------------------------

const declaredBound = (
  distribution: SyntheticDistribution,
  bound: 'min' | 'max',
): number | undefined =>
  bound in distribution
    ? (distribution as { min?: number; max?: number })[bound]
    : undefined;

/**
 * A finite edge for an OPEN window side, reaching far enough past the
 * distribution's centre that the sketch shows the tail dying away. Purely
 * presentational: it chooses how much axis to draw, never what a draw can be.
 */
const openEdge = (
  distribution: SyntheticDistribution,
  side: 'min' | 'max',
): number => {
  const direction = side === 'max' ? 1 : -1;
  switch (distribution.distribution) {
    case 'constant':
      return distribution.value + direction;
    case 'uniform': {
      const declared = declaredBound(distribution, side);
      return declared === undefined ? direction : declared + direction;
    }
    case 'poisson':
      return side === 'max'
        ? distribution.mean +
            OPEN_WINDOW_SPREADS * Math.sqrt(distribution.mean) +
            1
        : 0;
    case 'normal':
    case 'lognormal':
    case 'beta':
      return (
        distribution.mean +
        direction * (OPEN_WINDOW_SPREADS * distribution.sd + 1)
      );
  }
};

/** The stretch of axis the sketch draws: the window, made finite. */
const renderSpan = (
  distribution: SyntheticDistribution,
  window: SyntheticWindow,
): { lo: number; hi: number } => {
  const lo = Number.isFinite(window.min)
    ? window.min
    : openEdge(distribution, 'min');
  const hi = Number.isFinite(window.max)
    ? window.max
    : Math.max(openEdge(distribution, 'max'), lo + 1);
  return { lo, hi };
};

/**
 * The span the SCALE is given: the drawn span, widened when it has no width
 * at all. A stage pinned to one population (`minNodes === maxNodes`) hands
 * this component a window whose ends meet, and a linear scale over a
 * zero-width domain has no defined mapping — so a hair of axis is invented
 * either side, exactly as the old hand-rolled projection did. The endpoint
 * labels still report the real window.
 */
const scaleSpan = (
  distribution: SyntheticDistribution,
  window: SyntheticWindow,
): { lo: number; hi: number; degenerate: boolean } => {
  const { lo, hi } = renderSpan(distribution, window);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    return { lo: 0, hi: 1, degenerate: true };
  }
  if (!(hi > lo)) return { lo: lo - 1, hi: lo + 1, degenerate: true };
  return { lo, hi, degenerate: false };
};

// --- shape construction ------------------------------------------------------

/**
 * What to draw, in the author's own units. Heights are normalised to a peak
 * of 1 so the density axis stays unlabelled; the chart's scales turn these
 * into pixels.
 */
type Shape =
  | { kind: 'curve'; points: { value: number; density: number }[] }
  | {
      kind: 'bars';
      bars: { value: number; mass: number }[];
      thickness: number;
    };

/** All the mass at one value: a constant, or a zero-spread family. */
const spike = (value: number): Shape => ({
  kind: 'bars',
  bars: [{ value, mass: 1 }],
  thickness: SPIKE_THICKNESS,
});

const normalised = (value: number, tallest: number): number =>
  tallest > 0 ? value / tallest : 0;

const buildShape = (
  distribution: SyntheticDistribution,
  lo: number,
  hi: number,
): Shape => {
  // The support the draw is truncated into: the declared bounds intersected
  // with the drawn span. Density is zero outside it.
  const supportLo = Math.max(declaredBound(distribution, 'min') ?? lo, lo);
  const supportHi = Math.min(declaredBound(distribution, 'max') ?? hi, hi);

  switch (distribution.distribution) {
    case 'constant':
      return spike(distribution.value);
    case 'poisson': {
      const { mean } = distribution;
      const firstK = Math.max(0, Math.ceil(supportLo));
      const lastK = Math.floor(supportHi);
      const masses: { k: number; mass: number }[] = [];
      for (let k = firstK; k <= lastK; k += 1) {
        masses.push({ k, mass: poissonPmf(k, mean) });
      }
      const tallest = Math.max(...masses.map(({ mass }) => mass), 0);
      return {
        kind: 'bars',
        bars: masses.map(({ k, mass }) => ({
          value: k,
          mass: normalised(mass, tallest),
        })),
        thickness: BAR_THICKNESS,
      };
    }
    case 'uniform': {
      // Flat over the effective bounds, zero outside: a step function drawn
      // as a curve so the family reads as continuous. The repeated x values
      // at each riser are why both curve marks below take explicit interval
      // endpoints — see `curveMarks`.
      const height = supportHi > supportLo ? 1 : 0;
      return {
        kind: 'curve',
        points: [
          { value: lo, density: 0 },
          { value: supportLo, density: 0 },
          { value: supportLo, density: height },
          { value: supportHi, density: height },
          { value: supportHi, density: 0 },
          { value: hi, density: 0 },
        ],
      };
    }
    case 'normal':
    case 'lognormal':
    case 'beta': {
      if (distribution.sd === 0) {
        // Zero spread has single-point support at the mean — the same reading
        // every zero-deviation rule in the schema takes.
        return spike(distribution.mean);
      }
      const pdf =
        distribution.distribution === 'normal'
          ? (x: number) => normalPdf(x, distribution.mean, distribution.sd)
          : distribution.distribution === 'lognormal'
            ? (x: number) => lognormalPdf(x, distribution.mean, distribution.sd)
            : (x: number) => betaPdf(x, distribution.mean, distribution.sd);
      const densities: { x: number; density: number }[] = [];
      for (let index = 0; index <= SAMPLES; index += 1) {
        const x = lo + ((hi - lo) * index) / SAMPLES;
        const inSupport = x >= supportLo && x <= supportHi;
        densities.push({ x, density: inSupport ? pdf(x) : 0 });
      }
      const tallest = Math.max(...densities.map(({ density }) => density), 0);
      return {
        kind: 'curve',
        points: densities.map(({ x, density }) => ({
          value: x,
          density: normalised(density, tallest),
        })),
      };
    }
  }
};

// --- chart -------------------------------------------------------------------

/**
 * The sketch's own baseline, drawn as a rule at zero density rather than as
 * an axis, because `guides: false` removes the axes this sketch has no use
 * for and would otherwise take the baseline with them.
 */
const baselineMark = () =>
  ruleY([0], { stroke: MUTED, strokeOpacity: BASELINE_OPACITY });

/**
 * A configured scale INSTANCE fixes the domain to the schema's window; a
 * scale factory would let the library infer the domain from the data
 * instead, which would silently redraw a constant in the middle of whatever
 * window it was given rather than at the value the author typed.
 */
const axesOver = (lo: number, hi: number) => ({
  x: { scale: scaleLinear().domain([lo, hi]) },
  y: { scale: scaleLinear().domain([DENSITY_FLOOR, DENSITY_CEILING]) },
});

/**
 * How the chart meets the DOM, shared by both mark families. With neither a
 * `width` nor a `height`, the host takes its container's full width, holds
 * the plot to {@link CHART_ASPECT}, and re-lays-out — new scales, new
 * geometry, not a stretched bitmap — whenever a `ResizeObserver` reports that
 * width changed. {@link INITIAL_WIDTH} is only what it draws before the first
 * measurement lands.
 */
const SURFACE = {
  aspectRatio: CHART_ASPECT,
  initialWidth: INITIAL_WIDTH,
  tabIndex: -1,
  ariaLabel: CHART_LABEL,
} as const;

type Span = { lo: number; hi: number };

/**
 * A filled shape under a stroked outline. The area mark takes EXPLICIT
 * interval endpoints (`y1`/`y2`) rather than the implicit `y`: an area reads
 * a repeated x position as a stack to accumulate, and the uniform step visits
 * each riser's x twice, which the library refuses with "a stack requires at
 * most one value for each position and series". Explicit endpoints opt out of
 * stacking altogether, which is what a single-series density wants anyway.
 */
function CurveChart({
  points,
  lo,
  hi,
}: Span & { points: { value: number; density: number }[] }) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          areaY(points, {
            x: 'value',
            y1: 0,
            y2: 'density',
            fill: ACCENT,
            fillOpacity: AREA_OPACITY,
          }),
          lineY(points, {
            x: 'value',
            y: 'density',
            stroke: ACCENT,
            strokeWidth: LINE_WIDTH,
          }),
          baselineMark(),
        ],
        ...axesOver(lo, hi),
        ...INERT_CHART,
      }),
    [points, lo, hi],
  );

  return <Chart definition={definition} {...SURFACE} />;
}

function BarsChart({
  bars,
  thickness,
  lo,
  hi,
}: Span & { bars: { value: number; mass: number }[]; thickness: number }) {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(bars, {
            x: 'value',
            y: 'mass',
            fill: ACCENT,
            fillOpacity: BAR_OPACITY,
            maxThickness: thickness,
            radius: BAR_RADIUS,
          }),
          baselineMark(),
        ],
        ...axesOver(lo, hi),
        ...INERT_CHART,
      }),
    [bars, thickness, lo, hi],
  );

  return <Chart definition={definition} {...SURFACE} />;
}

function DistributionChart({
  distribution,
  window,
}: Omit<DistributionVisualProps, 'className'>) {
  const { lo, hi, shape } = useMemo(() => {
    const span = scaleSpan(distribution, window);
    return {
      lo: span.lo,
      hi: span.hi,
      shape: span.degenerate
        ? spike((span.lo + span.hi) / 2)
        : buildShape(distribution, span.lo, span.hi),
    };
  }, [distribution, window]);

  if (shape.kind === 'curve') {
    return <CurveChart points={shape.points} lo={lo} hi={hi} />;
  }
  return (
    <BarsChart bars={shape.bars} thickness={shape.thickness} lo={lo} hi={hi} />
  );
}

/**
 * The chart library is an alpha, and this sketch sits inside a stage editor
 * holding a researcher's uncommitted draft — a throw from a mark it cannot
 * lay out must cost the decoration, never the work. The boundary keeps the
 * plot's box and its baseline so the endpoint labels stay where they were,
 * and reports the failure the way every other caught error in this app is
 * reported (`AppErrorBoundary`) rather than swallowing it: a family the
 * library cannot draw is a bug to fix, not a blank to live with, and the
 * parameter combinations researchers actually author are not ones a
 * developer will happen to type.
 */
type ChartBoundaryProps = {
  /** The inputs being drawn; a change to them is a fresh attempt. */
  attempt: string;
  children: ReactNode;
};

class ChartBoundary extends Component<
  ChartBoundaryProps,
  { failed: boolean; attempt: string }
> {
  state = { failed: false, attempt: this.props.attempt };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  /**
   * One combination the library cannot draw must not blank the sketch for the
   * rest of the session: the next keystroke is different input, so it gets its
   * own attempt. Without this the researcher would have to leave the editor
   * and come back to see any shape again.
   */
  static getDerivedStateFromProps(
    props: ChartBoundaryProps,
    state: { failed: boolean; attempt: string },
  ) {
    if (props.attempt === state.attempt) return null;
    return { failed: false, attempt: props.attempt };
  }

  componentDidCatch(error: unknown) {
    posthog.captureException(ensureError(error));
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className="border-text/30 w-full border-b"
          style={{ aspectRatio: CHART_ASPECT }}
        />
      );
    }
    return this.props.children;
  }
}

export function DistributionVisual({
  distribution,
  window,
  className,
}: DistributionVisualProps) {
  return (
    <div
      // The numeric fields are the accessible representation of these values;
      // this sketch is redundant decoration for assistive technology.
      aria-hidden="true"
      role="presentation"
      className={cx('w-full max-w-64 min-w-0 select-none', className)}
    >
      <ChartBoundary attempt={JSON.stringify([distribution, window])}>
        <DistributionChart distribution={distribution} window={window} />
      </ChartBoundary>
      <div className="text-text/70 flex justify-between text-xs">
        <span>{formatWindowEndpoint(window.min)}</span>
        <span>{formatWindowEndpoint(window.max)}</span>
      </div>
    </div>
  );
}

/**
 * The density and mass functions the sketch draws, exported so the unit tests
 * can hold them to known values — a rendering smoke test cannot witness a
 * wrong pdf. Not part of any consumer contract.
 */
export const distributionMath = {
  betaPdf,
  logGamma,
  lognormalPdf,
  normalPdf,
  poissonPmf,
};
