import type { IntlShape } from '@codaco/app-i18n/messages';

import { getOperatorsAsOptions, operatorsByType, validTypes } from './options';

/**
 * What a rule targets. `rule.type` holds one of these; the entity TYPE a
 * node/edge rule is pointed at lives in `rule.options.type`.
 */
export type RuleTargetType = 'node' | 'edge' | 'ego';

export type RuleOptionItem = { value: string | number; label: string };
export type RuleVariableOptionItem = {
  value: string;
  label: string;
  type: string;
};

/** One choice of rule target, as offered by the editor's Entity control. */
export type RuleTypeOption = { label: string; value: RuleTargetType };

export const isRuleTargetType = (value: unknown): value is RuleTargetType =>
  value === 'node' || value === 'edge' || value === 'ego';

/**
 * The codebook reaches the rule builder as an opaque object (it is Redux
 * state, threaded through a field value), so every read below narrows rather
 * than asserts a shape the caller never promised.
 */
const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  // A plain object IS a string-keyed record; TypeScript has no narrowing for
  // that, and the guard above is the whole check.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return value as Record<string, unknown>;
};

const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * The variables a rule may address.
 *
 * Ego rules read the ego codebook. Alter rules read the variables of the
 * node/edge type they have been pointed at, and so have nothing to offer
 * until one is chosen.
 */
export const getRuleVariables = (
  codebook: Record<string, unknown>,
  target: RuleTargetType,
  entityTypeId: string | undefined,
): Record<string, unknown> => {
  if (target === 'ego') {
    return asRecord(asRecord(codebook.ego)?.variables) ?? {};
  }
  if (!entityTypeId) return {};
  const entity = asRecord(asRecord(codebook[target])?.[entityTypeId]);
  return asRecord(entity?.variables) ?? {};
};

/** Only variable types a rule can actually compare are offered. */
export const getVariablesAsOptions = (
  variables: Record<string, unknown>,
): RuleVariableOptionItem[] =>
  Object.entries(variables).flatMap(([variableId, definition]) => {
    const variable = asRecord(definition);
    const type = asNonEmptyString(variable?.type);
    if (!type || !validTypes.has(type)) return [];
    return [
      {
        value: variableId,
        label: asNonEmptyString(variable?.name) ?? variableId,
        type,
      },
    ];
  });

export const getRuleVariableType = (
  variables: Record<string, unknown>,
  variableId: string | undefined,
): string | undefined =>
  variableId
    ? asNonEmptyString(asRecord(variables[variableId])?.type)
    : undefined;

/** The authored option set of a categorical/ordinal variable, if it has one. */
export const getRuleVariableOptions = (
  variables: Record<string, unknown>,
  variableId: string | undefined,
): RuleOptionItem[] | undefined => {
  if (!variableId) return undefined;
  const options = asRecord(variables[variableId])?.options;
  if (!Array.isArray(options)) return undefined;

  // The stored operand is compared against these values, so they keep the type
  // the codebook authored them with — coercing a numeric option to a string
  // here would save a rule that no longer matches anything.
  const normalized = options.flatMap<RuleOptionItem>((candidate) => {
    const option = asRecord(candidate);
    const value = option?.value;
    if (typeof value !== 'string' && typeof value !== 'number') return [];
    const label = option?.label;
    return [
      { value, label: typeof label === 'string' ? label : String(value) },
    ];
  });

  return normalized.length > 0 ? normalized : undefined;
};

/**
 * The operators offered for a variable of this type. A rule with no attribute
 * yet — a presence rule, or a variable rule mid-authoring — gets the
 * existence operators, which is what `operatorsByType.exists` holds.
 */
const operatorsForType = new Map<string, ReadonlySet<string>>(
  Object.entries(operatorsByType),
);

export const getOperatorOptions = (
  variableType: string | undefined,
  intl?: IntlShape,
): RuleOptionItem[] => {
  const allowed =
    (variableType ? operatorsForType.get(variableType) : undefined) ??
    operatorsByType.exists;

  return getOperatorsAsOptions(intl).filter(({ value }) => allowed.has(value));
};
