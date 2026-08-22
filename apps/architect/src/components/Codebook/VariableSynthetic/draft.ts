import {
  optionValueKey,
  SCALAR_DOMAIN,
  VARIABLE_TYPE_VALIDATIONS,
  VariableSchema,
  type ComponentType,
  type EffectiveVariableRules,
  type ResolvedVariableSynthetic,
  type SyntheticOptionWeight,
  type VariableSynthetic,
  type VariableType,
} from '@codaco/protocol-validation';
import { effectiveSyntheticRules } from '~/components/Synthetic/effectiveRules';
import {
  formatDatetimeSynthetic,
  formatProbability,
  formatSyntheticDistribution,
  type SyntheticWindow,
} from '~/components/Synthetic/summaries';
import { TEXT_GENERATOR_LABELS } from '~/components/Synthetic/textGenerators';

/**
 * The reading, writing and summarising of a codebook variable's `synthetic`
 * block, shared by every surface that edits one.
 *
 * Two rules shape everything here. **Authored = key present** (spec governing
 * rule 4): a block that declares nothing is removed rather than stored empty,
 * which is also what the schema's own "must declare at least one property"
 * refusal requires. And **the schema decides what is admissible** (rule 1):
 * a proposed block is offered to `VariableSchema` and kept only if the schema
 * accepts it, so no rule is restated here in order to prevent an invalid edit.
 */

/**
 * The parts of a variable this editor reads and writes.
 *
 * Structural rather than the parsed `Variable` union, because the draft a
 * dialog holds is mid-edit — a variable being created has no options yet, and
 * a type editor's working copy is a plain record.
 */
export type SyntheticVariableDraft = {
  name?: string;
  type: VariableType;
  component?: ComponentType;
  options?: readonly {
    readonly value: string | number | boolean;
    readonly label?: string;
  }[];
  parameters?: unknown;
  validation?: Record<string, unknown> | undefined;
  synthetic?: VariableSynthetic | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readNumber = (
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined => {
  const value = source?.[key];
  return typeof value === 'number' ? value : undefined;
};

const readBoolean = (
  source: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined => {
  const value = source?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

/**
 * The rules a generated value for this variable must satisfy: what the
 * variable declares, narrowed by whatever the protocol's interfaces impose.
 *
 * Reads the declared half off a variable DRAFT — a mid-edit record rather than
 * a parsed variable — and hands both halves to
 * {@link effectiveSyntheticRules}, which owns the combination (including the
 * bin-only gate) for every surface that asks it.
 */
export const effectiveVariableRules = (
  variable: SyntheticVariableDraft,
  implied: EffectiveVariableRules = {},
  binOnly = false,
): EffectiveVariableRules => {
  const validation = isRecord(variable.validation)
    ? variable.validation
    : undefined;
  const declared: EffectiveVariableRules = {};
  const required = readBoolean(validation, 'required');
  if (required !== undefined) declared.required = required;
  const unique = readBoolean(validation, 'unique');
  if (unique !== undefined) declared.unique = unique;
  for (const rule of [
    'minValue',
    'maxValue',
    'minSelected',
    'maxSelected',
  ] as const) {
    const bound = readNumber(validation, rule);
    if (bound !== undefined) declared[rule] = bound;
  }

  return effectiveSyntheticRules(declared, implied, binOnly);
};

/**
 * The window a value of this variable is drawn inside, as the rules describe
 * it — the window the fields enforce, the summary elides restated bounds
 * against, and the distribution visual is sketched over.
 *
 * Open on a side the rules leave open. `DistributionVisual` sketches an open
 * side from the distribution's own spread, and `formatWindowEndpoint` labels
 * it as open rather than inventing a number.
 */
export const variableValueWindow = (
  variable: SyntheticVariableDraft,
  rules: EffectiveVariableRules,
): SyntheticWindow => {
  if (variable.type === 'scalar') {
    // A scalar is recorded on the schema's own normalised scale, which a
    // declared bound may narrow but never widen.
    return {
      min: Math.max(
        rules.minValue ?? SCALAR_DOMAIN.minValue,
        SCALAR_DOMAIN.minValue,
      ),
      max: Math.min(
        rules.maxValue ?? SCALAR_DOMAIN.maxValue,
        SCALAR_DOMAIN.maxValue,
      ),
    };
  }
  return {
    min: rules.minValue ?? Number.NEGATIVE_INFINITY,
    max: rules.maxValue ?? Number.POSITIVE_INFINITY,
  };
};

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * A block with its unstated keys removed, and `undefined` where nothing is
 * left — the serialisation rule that makes "authored" mean "key present".
 *
 * An empty option-weight table and an empty selection table are removed too:
 * the schema requires at least one entry in each, and a table the author has
 * emptied says exactly what no table says.
 */
export const normaliseSynthetic = (
  next: Record<string, unknown> | undefined,
): VariableSynthetic | undefined => {
  if (next === undefined) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (
      key === 'selectionCount' &&
      isRecord(value) &&
      Array.isArray(value.probabilities) &&
      value.probabilities.length === 0
    ) {
      continue;
    }
    cleaned[key] = value;
  }
  // A `distribution` discriminant on its own is a complete declaration; every
  // other block needs at least one stated property.
  if (Object.keys(cleaned).length === 0) return undefined;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return cleaned as VariableSynthetic;
};

const VARIABLE_TYPES: ReadonlySet<string> = new Set(
  Object.keys(VARIABLE_TYPE_VALIDATIONS),
);

/**
 * One codebook variable read out of a form value, which is `unknown` by the
 * time it reaches a control.
 *
 * Defensive because the record it comes from is the type editor's working copy
 * of the whole codebook entry: an imported protocol can carry anything, and a
 * variable that is not one is skipped rather than crashing the editor.
 */
export const asSyntheticVariableDraft = (
  raw: unknown,
): (SyntheticVariableDraft & { name: string }) | undefined => {
  if (!isRecord(raw)) return undefined;
  const { name, type } = raw;
  if (typeof name !== 'string' || typeof type !== 'string') return undefined;
  if (!VARIABLE_TYPES.has(type)) return undefined;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { ...raw, name, type: type as VariableType };
};

/** The distinct values an option list offers, in first-occurrence order. */
const distinctOptionValues = (
  variable: SyntheticVariableDraft,
): (string | number | boolean)[] => {
  const seen = new Set<string>();
  const values: (string | number | boolean)[] = [];
  for (const option of variable.options ?? []) {
    const key = optionValueKey(option.value);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(option.value);
  }
  return values;
};

/**
 * A variable whose declared validation has been replaced by its EFFECTIVE
 * rules, so a schema parse of it answers questions about the rules the
 * interview actually applies rather than only the ones the codebook states.
 *
 * Filtered through `VARIABLE_TYPE_VALIDATIONS`, the schema's own record of
 * which rules each variable type accepts, so the probe cannot fail merely
 * because it named a rule this type has no place for.
 */
const withEffectiveValidation = (
  variable: SyntheticVariableDraft,
  rules: EffectiveVariableRules,
): SyntheticVariableDraft => {
  const accepted: Record<string, boolean> = VARIABLE_TYPE_VALIDATIONS[
    variable.type
  ] as Record<string, boolean>;
  const validation: Record<string, unknown> = {
    ...(isRecord(variable.validation) ? variable.validation : {}),
  };
  for (const [rule, bound] of Object.entries(rules)) {
    if (bound === undefined || accepted[rule] !== true) continue;
    validation[rule] = bound;
  }
  return { ...variable, validation };
};

/**
 * Whether the schema accepts this variable carrying this block.
 *
 * The guard that makes an inadmissible edit unrepresentable without restating
 * a single rule: the proposal is parsed by `VariableSchema` itself, over a
 * variable carrying its EFFECTIVE rules, so a block an interface-implied rule
 * forbids is refused exactly as a declared one would refuse it.
 *
 * The boolean half of {@link syntheticRefusals}, which is the same question
 * asked so that what the schema SAID can be shown beside the control.
 */
export const syntheticIsAdmissible = (
  variable: SyntheticVariableDraft,
  next: VariableSynthetic | undefined,
  rules: EffectiveVariableRules = {},
): boolean => syntheticRefusals(variable, next, rules).length === 0;

/** What identifies one issue, so the same one can be recognised twice. */
type SchemaIssue = {
  code: string;
  path: readonly PropertyKey[];
  message: string;
};

const issueKey = (issue: SchemaIssue): string =>
  `${issue.code}|${issue.path.map(String).join('.')}|${issue.message}`;

/**
 * The issues in `proposed` that the draft was not ALREADY carrying — a
 * multiset difference, so a fault reported twice over (one option list, two
 * duplicate values) stays reported as often as it is new.
 */
const issuesAttributableTo = (
  proposed: readonly SchemaIssue[],
  standing: readonly SchemaIssue[],
): SchemaIssue[] => {
  const remaining = new Map<string, number>();
  for (const issue of standing) {
    const key = issueKey(issue);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return proposed.filter((issue) => {
    const key = issueKey(issue);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
};

/**
 * WHY the schema will not accept a block, in its own words — the refusals
 * `syntheticIsAdmissible` reduces to a boolean.
 *
 * Every issue reported is caused by the block, and the way that is decided is
 * a DIFFERENCE rather than a precondition: the variable is parsed with the
 * proposal and, if that fails, without it, and only the issues the second
 * parse did not already raise are the block's to answer for. A variable being
 * created is invalid for reasons of its own until the moment it is finished —
 * an unwritten name, an option list still empty — and the earlier reading
 * (refuse to judge a draft that does not parse) let a proposal made in that
 * window through unchecked. Nothing rechecked it once the name arrived, so a
 * beta whose spread its own mean cannot support could be typed before the name
 * and saved after it, leaving the post-commit validation dialog to report what
 * the control should have refused.
 *
 * Cross-field rules are why the refusals are carried rather than reduced. A
 * beta's variance, a minimum above its maximum — no single field can state
 * either, so a boolean leaves the control snapping back on blur with nothing
 * said (spec rule 3: the UI never paraphrases a refusal, and never hides one).
 */
export const syntheticRefusals = (
  variable: SyntheticVariableDraft,
  next: VariableSynthetic | undefined,
  rules: EffectiveVariableRules = {},
): string[] => {
  if (next === undefined) return [];
  const { synthetic: _current, ...base } = withEffectiveValidation(
    variable,
    rules,
  );

  const proposed = VariableSchema.safeParse({ ...base, synthetic: next });
  if (proposed.success) return [];

  // Only parsed when there is something to attribute: a complete draft raises
  // nothing here, and this is asked once per keystroke on every control.
  const standing = VariableSchema.safeParse(base);
  return issuesAttributableTo(
    proposed.error.issues,
    standing.success ? [] : standing.error.issues,
  ).map((issue) => issue.message);
};

/**
 * How many options this variable may be answered with, as the SCHEMA answers
 * it: each candidate size is proposed as a one-row selection table and kept
 * only where the schema raises nothing about it.
 *
 * Asked this way so no rule about reachable sizes — a floor, a ceiling, a
 * required variable's refusal of zero, an option zeroed by its weight — is
 * ever restated here. Asked through {@link syntheticRefusals} so a variable
 * that is mid-creation, and therefore invalid for reasons of its own, is
 * still told which sizes its own options and rules reach.
 */
export const admissibleSelectionCounts = (
  variable: SyntheticVariableDraft,
  rules: EffectiveVariableRules,
): number[] => {
  const counts: number[] = [];
  const ceiling = distinctOptionValues(variable).length;
  // A variable with no options yet has no sizes to reach, and offering the
  // single "0 selections" the loop below would find says less than saying so.
  if (ceiling === 0) return [];
  for (let count = 0; count <= ceiling; count += 1) {
    const proposal = normaliseSynthetic({
      ...variable.synthetic,
      selectionCount: { probabilities: [{ count, probability: 1 }] },
    });
    if (syntheticRefusals(variable, proposal, rules).length === 0) {
      counts.push(count);
    }
  }
  return counts;
};

// ---------------------------------------------------------------------------
// Summarising
// ---------------------------------------------------------------------------

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 3 });

const weightsSummary = (weights: SyntheticOptionWeight[]): string => {
  if (weights.length === 0) return 'no options';
  const first = weights[0]?.weight;
  const even = weights.every((entry) => entry.weight === first);
  return even ? 'options drawn evenly' : 'options drawn by weight';
};

const selectionSummary = (counts: readonly number[]): string => {
  if (counts.length === 0) return '';
  const lowest = Math.min(...counts);
  const highest = Math.max(...counts);
  if (lowest === highest) {
    return lowest === 1
      ? '1 selection'
      : `${numberFormat.format(lowest)} selections`;
  }
  return `${numberFormat.format(lowest)}–${numberFormat.format(highest)} selections`;
};

/**
 * The one-line summary of what generation would actually do with this
 * variable, built from a RESOLVED descriptor so it can never disagree with the
 * draw (spec, component notes).
 */
export const summariseResolvedSynthetic = (
  resolved: ResolvedVariableSynthetic | undefined,
  window: SyntheticWindow,
): string => {
  if (resolved === undefined) return 'No values are generated for this type.';

  const parts: string[] = [];
  switch (resolved.type) {
    case 'text':
      parts.push(TEXT_GENERATOR_LABELS[resolved.generator]);
      break;
    case 'boolean':
      parts.push(`true ${formatProbability(resolved.probabilityTrue)}`);
      break;
    case 'ordinal':
      parts.push(weightsSummary(resolved.optionWeights));
      break;
    case 'categorical':
      parts.push(
        selectionSummary(
          resolved.selectionCount.probabilities.map((entry) => entry.count),
        ),
        weightsSummary(resolved.optionWeights),
      );
      break;
    case 'datetime':
      // The same formatter the overview's attribute table uses, so the
      // collapsed row and the row that links to it describe one descriptor
      // the same way.
      parts.push(formatDatetimeSynthetic(resolved));
      break;
    case 'number':
    case 'scalar':
      parts.push(formatSyntheticDistribution(resolved, { window }));
      break;
  }

  if (resolved.missingProbability > 0) {
    parts.push(`missing ${formatProbability(resolved.missingProbability)}`);
  }

  return parts.filter((part) => part !== '').join(', ');
};
