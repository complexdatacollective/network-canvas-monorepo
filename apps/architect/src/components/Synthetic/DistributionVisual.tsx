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
 * (spec, "Distribution visual").
 *
 * Decorative by contract: the numeric fields beside it are the accessible
 * representation, so the whole component is `aria-hidden`. Pure SVG, design
 * tokens only, and no animation — a distribution's shape is not a state
 * change, and the preview popup is the try-it path for realised draws.
 *
 * The WINDOW is the schema's own valid window for the field (a count's
 * resolved bounds, `topologyDrawWindow`'s result, a validation range, 0-1
 * for probabilities) — the same window the sibling fields enforce, imported
 * by the caller from `@codaco/protocol-validation`, never restated here
 * (spec governing rule 1). Densities are drawn unnormalised and scaled to the
 * tallest sampled point, so the vertical axis carries no numbers to restate.
 *
 * Every numeric literal below is presentation — sample resolution, canvas
 * geometry, and how far past the mean an OPEN window is sketched — and shapes
 * pixels only; generation reads nothing from this module.
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
const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 72;
/** Headroom above the tallest point so the curve's peak is never clipped. */
const PLOT_TOP = 4;
/** The baseline the axis sits on, inside the viewBox. */
const BASELINE = VIEW_HEIGHT - 1;
/** How many standard deviations past the mean an open window is sketched to. */
const OPEN_WINDOW_SPREADS = 4;
/** A spike (zero-spread family) rendered as a bar this wide, in view units. */
const SPIKE_WIDTH = 3;

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

// --- shape construction ------------------------------------------------------

type Shape =
  | { kind: 'curve'; points: { x: number; y: number }[] }
  | {
      kind: 'bars';
      bars: { key: string; x: number; width: number; height: number }[];
    };

const toX = (value: number, lo: number, hi: number): number =>
  ((value - lo) / (hi - lo)) * VIEW_WIDTH;

const toY = (density: number, tallest: number): number =>
  tallest <= 0
    ? BASELINE
    : BASELINE - (density / tallest) * (BASELINE - PLOT_TOP);

const spikeBar = (value: number, lo: number, hi: number): Shape => ({
  kind: 'bars',
  bars: [
    {
      key: 'spike',
      x: Math.min(
        Math.max(toX(value, lo, hi) - SPIKE_WIDTH / 2, 0),
        VIEW_WIDTH - SPIKE_WIDTH,
      ),
      width: SPIKE_WIDTH,
      height: BASELINE - PLOT_TOP,
    },
  ],
});

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
      return spikeBar(distribution.value, lo, hi);
    case 'poisson': {
      const { mean } = distribution;
      const firstK = Math.max(0, Math.ceil(supportLo));
      const lastK = Math.floor(supportHi);
      const masses: { k: number; mass: number }[] = [];
      for (let k = firstK; k <= lastK; k += 1) {
        masses.push({ k, mass: poissonPmf(k, mean) });
      }
      const tallest = Math.max(...masses.map(({ mass }) => mass), 0);
      // Bars sit centred on their integer, sized to the integer pitch.
      const pitch = VIEW_WIDTH / (hi - lo || 1);
      const width = Math.max(Math.min(pitch * 0.7, 12), 1);
      return {
        kind: 'bars',
        bars: masses.map(({ k, mass }) => ({
          key: String(k),
          x: Math.min(
            Math.max(toX(k, lo, hi) - width / 2, 0),
            VIEW_WIDTH - width,
          ),
          width,
          height: tallest <= 0 ? 0 : (mass / tallest) * (BASELINE - PLOT_TOP),
        })),
      };
    }
    case 'uniform': {
      // Flat over the effective bounds, zero outside: a step function drawn
      // as a curve so the family reads as continuous.
      const height = supportHi > supportLo ? 1 : 0;
      const points = [
        { x: toX(lo, lo, hi), y: toY(0, 1) },
        { x: toX(supportLo, lo, hi), y: toY(0, 1) },
        { x: toX(supportLo, lo, hi), y: toY(height, 1) },
        { x: toX(supportHi, lo, hi), y: toY(height, 1) },
        { x: toX(supportHi, lo, hi), y: toY(0, 1) },
        { x: toX(hi, lo, hi), y: toY(0, 1) },
      ];
      return { kind: 'curve', points };
    }
    case 'normal':
    case 'lognormal':
    case 'beta': {
      if (distribution.sd === 0) {
        // Zero spread has single-point support at the mean — the same reading
        // every zero-deviation rule in the schema takes.
        return spikeBar(distribution.mean, lo, hi);
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
          x: toX(x, lo, hi),
          y: toY(density, tallest),
        })),
      };
    }
  }
};

const curvePaths = (
  points: { x: number; y: number }[],
): { line: string; area: string } => {
  const segments = points
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' L ');
  const first = points[0];
  const last = points[points.length - 1];
  return {
    line: `M ${segments}`,
    area: `M ${first?.x.toFixed(2) ?? 0},${BASELINE} L ${segments} L ${last?.x.toFixed(2) ?? 0},${BASELINE} Z`,
  };
};

export function DistributionVisual({
  distribution,
  window,
  className,
}: DistributionVisualProps) {
  const { lo, hi } = renderSpan(distribution, window);
  const degenerate = !(hi > lo);
  const shape = degenerate
    ? spikeBar(lo, lo - 1, lo + 1)
    : buildShape(distribution, lo, hi);

  return (
    <div
      // The numeric fields are the accessible representation of these values;
      // this sketch is redundant decoration for assistive technology.
      aria-hidden="true"
      className={cx('w-full max-w-64 min-w-0 select-none', className)}
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="block h-auto w-full"
        role="presentation"
        focusable="false"
      >
        {shape.kind === 'curve' ? (
          (() => {
            const { line, area } = curvePaths(shape.points);
            return (
              <>
                <path d={area} className="fill-primary/15" />
                <path
                  d={line}
                  className="stroke-primary fill-none"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            );
          })()
        ) : (
          <g className="fill-primary/60">
            {shape.bars.map((bar) => (
              <rect
                key={bar.key}
                x={bar.x}
                y={BASELINE - bar.height}
                width={bar.width}
                height={bar.height}
                rx={1}
              />
            ))}
          </g>
        )}
        <line
          x1={0}
          y1={BASELINE}
          x2={VIEW_WIDTH}
          y2={BASELINE}
          className="stroke-text/30"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
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
