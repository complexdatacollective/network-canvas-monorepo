import type {
  SyntheticDistribution,
  SyntheticWindow,
} from '~/components/Synthetic/summaries';

/**
 * The shape of a distribution editor: which families exist, which parameters
 * each one carries, and what to seed a family with when the author switches to
 * it.
 *
 * Nothing here decides what is VALID — every candidate this module builds is
 * offered to the schema, which accepts or refuses it (see
 * `syntheticBlockForChange`). What it does own is presentation: the labels a
 * researcher reads, and the order in which candidate seeds are tried.
 *
 * The two `Record`s below are exhaustive over the schema's own family and
 * parameter unions, so a family added to `schemas/8/synthetic` fails the
 * typecheck here rather than rendering an editor with no fields.
 */

export type DistributionFamily = SyntheticDistribution['distribution'];

/** The parameter names the schema's distribution shapes are built from. */
export type DistributionParameter = 'value' | 'min' | 'max' | 'mean' | 'sd';

/** The parameters each family carries, in the order they are edited. */
export const DISTRIBUTION_PARAMETERS: Record<
  DistributionFamily,
  readonly DistributionParameter[]
> = {
  constant: ['value'],
  uniform: ['min', 'max'],
  poisson: ['mean'],
  normal: ['mean', 'sd'],
  lognormal: ['mean', 'sd'],
  beta: ['mean', 'sd'],
};

export const DISTRIBUTION_LABELS: Record<DistributionFamily, string> = {
  constant: 'Constant',
  uniform: 'Uniform',
  poisson: 'Poisson',
  normal: 'Normal',
  lognormal: 'Log-normal',
  beta: 'Beta',
};

/**
 * Every family, in the order an editor offers them. Held to
 * {@link DISTRIBUTION_PARAMETERS} — which is exhaustive over the schema's own
 * union — by a unit test, so a family added to the schema cannot reach a
 * select box with no parameters or be quietly left out of one.
 */
export const DISTRIBUTION_FAMILIES = [
  'constant',
  'uniform',
  'poisson',
  'normal',
  'lognormal',
  'beta',
] as const satisfies readonly DistributionFamily[];

export const PARAMETER_LABELS: Record<DistributionParameter, string> = {
  value: 'Value',
  min: 'Minimum',
  max: 'Maximum',
  mean: 'Mean',
  sd: 'Standard deviation',
};

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, window: SyntheticWindow): number =>
  Math.min(Math.max(value, window.min), window.max);

/**
 * Presentation only: a seed this module DERIVED (0.4 − 0.1 is
 * 0.30000000000000004 in binary floating point) is rounded to a precision a
 * researcher would have typed, so a family switch does not fill the box with
 * an artefact of the arithmetic. Never applied to a value the author entered.
 */
const SEED_PRECISION = 1e6;

const tidy = (value: number): number =>
  Number.isFinite(value)
    ? Math.round(value * SEED_PRECISION) / SEED_PRECISION
    : value;

/** The value a parameter currently holds, if the family declares it. */
export const parameterValue = (
  distribution: SyntheticDistribution,
  parameter: DistributionParameter,
): number | undefined => {
  switch (parameter) {
    case 'value':
      return 'value' in distribution ? distribution.value : undefined;
    case 'min':
      return 'min' in distribution ? distribution.min : undefined;
    case 'max':
      return 'max' in distribution ? distribution.max : undefined;
    case 'mean':
      return 'mean' in distribution ? distribution.mean : undefined;
    case 'sd':
      return 'sd' in distribution ? distribution.sd : undefined;
  }
};

const declared = (
  distribution: SyntheticDistribution,
  key: 'min' | 'max',
): number | undefined => parameterValue(distribution, key);

/**
 * The value a distribution sits around: the point a reader would call its
 * middle. Read off the declaration itself, so switching families keeps the
 * author where they were rather than jumping to a number from nowhere.
 */
export const distributionCentre = (
  distribution: SyntheticDistribution,
  window: SyntheticWindow,
): number => {
  switch (distribution.distribution) {
    case 'constant':
      return distribution.value;
    case 'uniform': {
      const low = declared(distribution, 'min') ?? window.min;
      const high = declared(distribution, 'max') ?? window.max;
      return finiteOr((low + high) / 2, finiteOr(low, 0));
    }
    default:
      return distribution.mean;
  }
};

/** How far a distribution reaches from its centre, in the same units. */
export const distributionSpread = (
  distribution: SyntheticDistribution,
  window: SyntheticWindow,
): number => {
  switch (distribution.distribution) {
    case 'constant':
      return 0;
    case 'poisson':
      return 0;
    case 'uniform': {
      const low = declared(distribution, 'min') ?? window.min;
      const high = declared(distribution, 'max') ?? window.max;
      return finiteOr((high - low) / 2, 0);
    }
    default:
      return distribution.sd;
  }
};

/**
 * A centre a family with an open-interval domain can actually take — beta's
 * mean must lie strictly inside its window, and a lognormal's must be
 * positive. Nudged to the window's own midpoint rather than to a constant, so
 * the replacement is still a statement about the field's range.
 */
const interiorCentre = (centre: number, window: SyntheticWindow): number => {
  if (centre > window.min && centre < window.max) return centre;
  const midpoint = tidy(
    (window.min + finiteOr(window.max, window.min + 1)) / 2,
  );
  return midpoint > window.min ? midpoint : window.min;
};

/**
 * Candidate declarations for a newly chosen family, best first.
 *
 * The caller offers them to the schema in order and writes the first it
 * accepts, which is how an integral field (a count) and a continuous one (a
 * density) share one code path: the raw seed carries the author's own centre
 * and spread, and the rounded one is what a whole-number field takes instead.
 * A zero-spread seed trails both, for the families whose spread is bounded by
 * their own mean.
 */
export const distributionCandidates = (
  family: DistributionFamily,
  current: SyntheticDistribution,
  window: SyntheticWindow,
): SyntheticDistribution[] => {
  const centre = tidy(clamp(distributionCentre(current, window), window));
  const spread = tidy(Math.max(distributionSpread(current, window), 0));

  const seeds = (raw: number, rawSpread: number): SyntheticDistribution[] => {
    const rounded = Math.round(raw);
    const roundedSpread = Math.round(rawSpread);
    switch (family) {
      case 'constant':
        return [
          { distribution: 'constant', value: raw },
          { distribution: 'constant', value: rounded },
        ];
      case 'uniform': {
        const low = tidy(clamp(raw - rawSpread, window));
        const high = tidy(clamp(raw + rawSpread, window));
        return [
          { distribution: 'uniform', min: low, max: high },
          {
            distribution: 'uniform',
            min: Math.round(low),
            max: Math.round(high),
          },
        ];
      }
      case 'poisson':
        return [
          { distribution: 'poisson', mean: raw },
          { distribution: 'poisson', mean: rounded },
        ];
      case 'normal':
        return [
          { distribution: 'normal', mean: raw, sd: rawSpread },
          { distribution: 'normal', mean: rounded, sd: roundedSpread },
          { distribution: 'normal', mean: rounded, sd: 0 },
        ];
      case 'lognormal': {
        const positive = interiorCentre(raw, {
          min: 0,
          max: Number.POSITIVE_INFINITY,
        });
        return [
          { distribution: 'lognormal', mean: positive, sd: rawSpread },
          { distribution: 'lognormal', mean: positive, sd: 0 },
        ];
      }
      case 'beta': {
        const inside = interiorCentre(raw, window);
        return [
          { distribution: 'beta', mean: inside, sd: rawSpread },
          { distribution: 'beta', mean: inside, sd: 0 },
        ];
      }
    }
  };

  return seeds(centre, spread);
};

/**
 * The window one parameter may be edited within: the field's own window,
 * narrowed by the sibling bound it must not cross, so an ordering the schema
 * refuses cannot be typed in the first place.
 *
 * A standard deviation's floor is zero because a spread has no direction —
 * that is the shape of the quantity, not a bound copied from the schema.
 */
export const parameterWindow = (
  distribution: SyntheticDistribution,
  parameter: DistributionParameter,
  window: SyntheticWindow,
): SyntheticWindow => {
  switch (parameter) {
    case 'min':
      return {
        min: window.min,
        max: declared(distribution, 'max') ?? window.max,
      };
    case 'max':
      return {
        min: declared(distribution, 'min') ?? window.min,
        max: window.max,
      };
    case 'sd':
      return { min: 0, max: Number.POSITIVE_INFINITY };
    default:
      return window;
  }
};

/**
 * The distribution with one parameter replaced, as a plain record: a candidate
 * for the schema to accept or refuse, never a declaration this module claims
 * is valid.
 */
export const withParameter = (
  distribution: SyntheticDistribution,
  parameter: DistributionParameter,
  value: number,
): Record<string, unknown> => ({ ...distribution, [parameter]: value });
