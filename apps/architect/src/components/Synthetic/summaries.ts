import type {
  EdgeTopology,
  NumberSynthetic,
  ResolvedVariableSynthetic,
  ScalarSynthetic,
  SyntheticCount,
} from '@codaco/protocol-validation';

/**
 * Pure formatting for RESOLVED synthetic descriptors: the human strings the
 * collapsed section summaries and the overview screen render.
 *
 * Everything here formats values obtained by parsing the current draft through
 * `CurrentProtocolSchema` — the schema's prefaults, defaults, and transforms
 * produce the effective values — so a summary can never disagree with what
 * generation would do (spec, component notes). Nothing here restates a bound,
 * a default, or a number of its own (spec governing rule 1): the only numbers
 * in this module's output are the ones the caller handed it.
 */

/**
 * An inclusive numeric window, as the schema's own resolvers describe one —
 * e.g. a count's resolution window or a probability's 0-1 domain. Callers
 * obtain it from `@codaco/protocol-validation` (the count transform's resolved
 * bounds, `topologyDrawWindow`, a variable's validation range), never from
 * literals of their own.
 */
export type SyntheticWindow = { min: number; max: number };

/**
 * The distribution shapes a stage or variable descriptor can carry, as the
 * schema types them: counts, edge-topology metrics, and numeric variable
 * values. Datetime distributions parameterise over date strings rather than
 * numbers, so they are not one of these — {@link formatDatetimeSynthetic}
 * summarises those.
 */
export type SyntheticDistribution =
  | SyntheticCount
  | EdgeTopology['distribution']
  | Extract<NumberSynthetic, { distribution: string }>
  | Extract<ScalarSynthetic, { distribution: string }>;

export type FormatDistributionOptions = {
  /**
   * The field's own valid window. When given, a declared truncation bound
   * that merely restates a window endpoint is elided — the schema's count
   * transform writes the stage window into every resolved poisson/normal
   * count, and repeating those structural bounds would bury the parameters
   * the author can actually reason about. A bound that NARROWS the window is
   * always shown.
   */
  window?: SyntheticWindow;
};

/**
 * `en` because the codebase currently renders numerals unlocalised (the
 * engine's own refusal strings do the same); a future i18n layer swaps the
 * locale here, in one place.
 */
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 3 });

/** Percentages keep enough precision to echo an authored 0.125 faithfully. */
const percentFormat = new Intl.NumberFormat('en', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const formatValue = (value: number): string => numberFormat.format(value);

type Bounds = { min?: number; max?: number };

/**
 * The truncation-bound parts of a distribution summary. `undefined` bounds
 * are unstated and never rendered; a stated bound is rendered unless it
 * equals the window endpoint it would merely restate.
 */
const boundParts = (bounds: Bounds, window?: SyntheticWindow): string[] => {
  const parts: string[] = [];
  if (bounds.min !== undefined && bounds.min !== window?.min) {
    parts.push(`min ${formatValue(bounds.min)}`);
  }
  if (bounds.max !== undefined && bounds.max !== window?.max) {
    parts.push(`max ${formatValue(bounds.max)}`);
  }
  return parts;
};

const withParams = (family: string, parts: string[]): string =>
  parts.length === 0 ? family : `${family}(${parts.join(', ')})`;

/**
 * One distribution as a compact human string: the family name and the
 * parameters that shape it — `constant(8)`, `uniform(min 2, max 6)`,
 * `poisson(mean 4)`, `normal(mean 8, sd 3)`, `lognormal(mean 2, sd 1)`,
 * `beta(mean 0.3, sd 0.15)` — with truncation bounds appended only where they
 * narrow the field's window (see {@link FormatDistributionOptions}).
 */
export const formatSyntheticDistribution = (
  distribution: SyntheticDistribution,
  options: FormatDistributionOptions = {},
): string => {
  const { window } = options;

  switch (distribution.distribution) {
    case 'constant':
      return withParams('constant', [formatValue(distribution.value)]);
    case 'uniform': {
      // A uniform's bounds ARE its parameters, so they are never elided —
      // but a bound the declaration leaves unstated has no number to show.
      const min = 'min' in distribution ? distribution.min : undefined;
      const max = 'max' in distribution ? distribution.max : undefined;
      const parts: string[] = [];
      if (min !== undefined) parts.push(`min ${formatValue(min)}`);
      if (max !== undefined) parts.push(`max ${formatValue(max)}`);
      return withParams('uniform', parts);
    }
    case 'poisson':
      return withParams('poisson', [
        `mean ${formatValue(distribution.mean)}`,
        ...boundParts(distribution, window),
      ]);
    case 'normal':
    case 'lognormal': {
      const bounds: Bounds = {
        min: 'min' in distribution ? distribution.min : undefined,
        max: 'max' in distribution ? distribution.max : undefined,
      };
      return withParams(distribution.distribution, [
        `mean ${formatValue(distribution.mean)}`,
        `sd ${formatValue(distribution.sd)}`,
        ...boundParts(bounds, window),
      ]);
    }
    case 'beta':
      return withParams('beta', [
        `mean ${formatValue(distribution.mean)}`,
        `sd ${formatValue(distribution.sd)}`,
      ]);
  }
};

/** A resolved stage count, e.g. `normal(mean 8, sd 3)`. */
export const formatSyntheticCount = (
  count: SyntheticCount,
  options: FormatDistributionOptions = {},
): string => formatSyntheticDistribution(count, options);

/** The anchor a session-relative datetime window is measured from by default. */
const SESSION_DATE_ANCHOR = 'the interview date';

type ResolvedDatetime = Extract<
  ResolvedVariableSynthetic,
  { type: 'datetime' }
>;

/**
 * The window parts of a datetime descriptor, in the vocabulary the schema
 * states it in: absolute endpoints as the date strings they are, and a
 * session-relative window as the day offsets it carries.
 */
const datetimeWindowParts = (descriptor: ResolvedDatetime): string[] => {
  const parts: string[] = [];
  if (descriptor.min !== undefined) parts.push(`from ${descriptor.min}`);
  if (descriptor.max !== undefined) parts.push(`to ${descriptor.max}`);
  const { relative } = descriptor;
  if (relative !== undefined) {
    // Resolved to a local rather than defaulted inline: `??` binds looser than
    // the `+` joining these segments, so an inline default would read as a
    // default for the whole concatenation and never apply.
    const anchor = relative.anchor ?? SESSION_DATE_ANCHOR;
    parts.push(
      `${formatValue(relative.before)} days before to ` +
        `${formatValue(relative.after)} days after ${anchor}`,
    );
  }
  return parts;
};

/**
 * A resolved datetime descriptor, e.g.
 * `uniform(3,650 days before to 0 days after the interview date)`.
 *
 * Its own formatter rather than a case inside
 * {@link formatSyntheticDistribution}: a datetime's centre and endpoints are
 * date STRINGS and its spread is a number of days, so none of the numeric
 * formatting above has anything to say about them. The `family(parameters)`
 * shape is shared deliberately — a researcher reading the overview beside a
 * number's summary is reading one convention, not two.
 */
export const formatDatetimeSynthetic = (descriptor: ResolvedDatetime): string =>
  withParams(
    descriptor.distribution,
    descriptor.distribution === 'normal'
      ? [
          `mean ${descriptor.mean}`,
          `sd ${formatValue(descriptor.sdDays)} days`,
          ...datetimeWindowParts(descriptor),
        ]
      : datetimeWindowParts(descriptor),
  );

const EDGE_TOPOLOGY_METRIC_LABELS: Record<EdgeTopology['metric'], string> = {
  density: 'density',
  meanDegree: 'mean degree',
};

/**
 * A resolved edge topology, e.g. `mean degree normal(mean 3, sd 1)` or
 * `density beta(mean 0.3, sd 0.15)`.
 */
export const formatEdgeTopology = (
  topology: EdgeTopology,
  options: FormatDistributionOptions = {},
): string =>
  `${EDGE_TOPOLOGY_METRIC_LABELS[topology.metric]} ${formatSyntheticDistribution(
    topology.distribution,
    options,
  )}`;

/**
 * A resolved probability (nomination odds, probability-true, missingness,
 * other-bin share) as a percentage: `0.3` renders as `30%`.
 */
export const formatProbability = (probability: number): string =>
  percentFormat.format(probability);

/**
 * A window endpoint for display beside a distribution visual. Some schema
 * windows are open on one side (a mean degree has no ceiling), and an open
 * endpoint is labelled as such rather than as a number nobody declared.
 */
export const formatWindowEndpoint = (value: number): string => {
  if (value === Number.POSITIVE_INFINITY) return '∞';
  if (value === Number.NEGATIVE_INFINITY) return '−∞';
  return formatValue(value);
};

/**
 * A resolved response burden. A RATE rather than a probability — it may
 * exceed 1 — so it renders as the plain number the author wrote.
 */
export const formatResponseBurden = (burden: number): string =>
  formatValue(burden);
