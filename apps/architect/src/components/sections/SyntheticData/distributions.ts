import {
  type SyntheticDistributionSpec,
  type SyntheticParameter,
} from '~/components/Synthetic/schemaIntrospection';
import type {
  SyntheticDistribution,
  SyntheticWindow,
} from '~/components/Synthetic/summaries';
import {
  narrowedWindow,
  type NumericWindow,
  numericWindowOf,
} from '~/components/Synthetic/useNumericDraft';

/**
 * The shape of a distribution editor: which parameters each family carries,
 * what each of them may be, and what to seed a family with when the author
 * switches to it.
 *
 * Nothing here decides what is VALID — every candidate this module builds is
 * offered to the schema, which accepts or refuses it (see
 * `syntheticBlockForChange`), and every window it reports was read out of the
 * schema handed in rather than restated. What it does own is presentation: the
 * labels a researcher reads, which parameters of a family they edit, and the
 * order in which candidate seeds are tried.
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
 * Every family this codebase knows how to render an editor for. Held to
 * {@link DISTRIBUTION_PARAMETERS} — which is exhaustive over the schema's own
 * union — by a unit test, so a family added to the schema cannot reach a
 * select box with no parameters or be quietly left out of one.
 *
 * Which of them a given FIELD offers is a different question, and one only
 * that field's schema can answer (a count has no beta; a mean degree has no
 * ceiling to put one under): see {@link offeredFamilies}.
 */
export const DISTRIBUTION_FAMILIES = [
  'constant',
  'uniform',
  'poisson',
  'normal',
  'lognormal',
  'beta',
] as const satisfies readonly DistributionFamily[];

/** A family name the editors know how to render, or `undefined`. */
const asDistributionFamily = (name: string): DistributionFamily | undefined =>
  DISTRIBUTION_FAMILIES.find((family) => family === name);

/**
 * The families ONE field admits, in the order its schema declares them.
 *
 * Read off the schema rather than offered from the list above, so a select can
 * never present a family the field's own union refuses — a beta count, or a
 * log-normal density — and so a family added to that union appears here with
 * nothing edited.
 */
export const offeredFamilies = (
  specs: readonly SyntheticDistributionSpec[],
): DistributionFamily[] =>
  specs
    .map((spec) => asDistributionFamily(spec.family))
    .filter((family): family is DistributionFamily => family !== undefined);

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
 * The parameters that name a value the FIELD's own window bounds: the single
 * value a constant returns, and the bounds a draw is truncated into. A `mean`
 * or an `sd` does not — a truncated normal's mean may sit outside the window
 * its draws land in, and the schema says so by bounding those parameters
 * differently (a count's `value` is a whole number inside the population
 * ceiling, while its `mean` is neither).
 *
 * The one piece of parameter semantics this module holds. Everything else
 * about a parameter — its bounds, its exclusivity, whether it is a whole
 * number — is read out of the schema.
 */
const SUPPORT_PARAMETERS: ReadonlySet<string> = new Set([
  'value',
  'min',
  'max',
]);

/** What the schema says about one parameter of one family, if it has one. */
const specParameter = (
  spec: SyntheticDistributionSpec | undefined,
  parameter: DistributionParameter,
): SyntheticParameter | undefined =>
  spec?.parameters.find((candidate) => candidate.key === parameter);

/**
 * The window one parameter may be edited within: the window its OWN schema
 * states, narrowed — for a parameter that names a value of the field — by the
 * field's window and by the sibling bound it must not cross, so an ordering
 * the schema refuses cannot be typed in the first place.
 *
 * Read from the schema rather than assumed, because the assumption was wrong
 * in both directions at once: a count's parameters are not all whole numbers
 * (`normal(mean 5.5, sd 2.5)` is a legal count) and a count's mean has no
 * floor of its own (a negative mean with spread is the sanctioned "usually
 * none, occasionally a few").
 */
export const parameterWindow = (
  distribution: SyntheticDistribution,
  parameter: DistributionParameter,
  window: SyntheticWindow,
  spec: SyntheticDistributionSpec | undefined,
): NumericWindow => {
  // A parameter the field's schema does not describe is one this editor should
  // not be offering; holding it to the field's window is the conservative
  // reading, and the schema still refuses whatever it refuses.
  const own = specParameter(spec, parameter)?.window ?? numericWindowOf(window);
  if (!SUPPORT_PARAMETERS.has(parameter)) return own;

  // The bound this one must not cross, where the declaration states it. An
  // unstated sibling closes nothing.
  const sibling: SyntheticWindow = {
    min:
      parameter === 'max'
        ? (declared(distribution, 'min') ?? Number.NEGATIVE_INFINITY)
        : Number.NEGATIVE_INFINITY,
    max:
      parameter === 'min'
        ? (declared(distribution, 'max') ?? Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY,
  };

  return narrowedWindow(
    narrowedWindow(own, numericWindowOf(window)),
    numericWindowOf(sibling),
  );
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
