import type {
  Codebook,
  ColorReference,
  FilterOperator,
  NodeShape,
  Variable,
  Variables,
  VariableType,
} from '@codaco/protocol-validation';

import {
  isRuleVariableType,
  operatorsAsOptions,
  operatorsByType,
  type RuleOperatorOption,
} from './operators.ts';

/**
 * What a rule targets. `rule.type` holds one of these; the entity TYPE a
 * node/edge rule is pointed at lives in `rule.options.type`.
 */
export type RuleTargetType = 'node' | 'edge' | 'ego';

/** The two targets that name a codebook entity type. */
export type RuleEntityTarget = 'node' | 'edge';

export const isRuleTargetType = (value: unknown): value is RuleTargetType =>
  value === 'node' || value === 'edge' || value === 'ego';

export const isRuleEntityTarget = (value: unknown): value is RuleEntityTarget =>
  value === 'node' || value === 'edge';

/** One attribute a rule may address. */
export type RuleVariableOption = Readonly<{
  value: string;
  label: string;
  type: VariableType;
}>;

/** One authored option of a categorical or ordinal attribute. */
export type RuleChoiceOption = Readonly<{
  value: string | number;
  label: string;
}>;

/** One codebook entity type a node or edge rule may be pointed at. */
export type RuleEntityTypeOption = Readonly<{
  value: string;
  label: string;
  color: ColorReference;
  shape?: NodeShape;
}>;

const EMPTY_VARIABLES: Readonly<Variables> = Object.freeze({});

export const DEFAULT_NODE_COLOR: ColorReference = 'node-color-seq-1';
export const DEFAULT_EDGE_COLOR: ColorReference = 'edge-color-seq-1';

/**
 * The variables a rule may address.
 *
 * Ego rules read the ego codebook. Alter rules read the variables of the
 * node/edge type they have been pointed at, and so have nothing to offer
 * until one is chosen — or once the type they named has been deleted.
 *
 * Takes the codebook rather than the whole protocol context because the same
 * reads serve the printable-summary helper, which a host calls with a
 * validated protocol's codebook and no editing session at all.
 */
export const ruleVariables = (
  codebook: Readonly<Codebook>,
  target: RuleTargetType,
  entityTypeId: string | undefined,
): Readonly<Variables> => {
  if (target === 'ego') return codebook.ego?.variables ?? EMPTY_VARIABLES;
  if (entityTypeId === undefined || entityTypeId === '') return EMPTY_VARIABLES;
  return codebook[target]?.[entityTypeId]?.variables ?? EMPTY_VARIABLES;
};

/** Whether the codebook still describes the entity type a rule names. */
export const ruleEntityTypeExists = (
  codebook: Readonly<Codebook>,
  target: RuleTargetType,
  entityTypeId: string | undefined,
): boolean => {
  if (target === 'ego') return codebook.ego !== undefined;
  if (entityTypeId === undefined || entityTypeId === '') return false;
  return codebook[target]?.[entityTypeId] !== undefined;
};

/** Only attribute types a rule can actually compare are offered. */
export const ruleVariableOptions = (
  variables: Readonly<Variables>,
): RuleVariableOption[] =>
  Object.entries(variables).flatMap<RuleVariableOption>(
    ([variableId, definition]) => {
      const type: unknown = definition.type;
      if (!isRuleVariableType(type)) return [];
      return [
        {
          value: variableId,
          label: definition.name === '' ? variableId : definition.name,
          type,
        },
      ];
    },
  );

export const ruleVariable = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
): Readonly<Variable> | undefined =>
  variableId === undefined || variableId === ''
    ? undefined
    : variables[variableId];

export const ruleVariableType = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
): VariableType | undefined => {
  const type: unknown = ruleVariable(variables, variableId)?.type;
  return isRuleVariableType(type) ? type : undefined;
};

/**
 * The authored option set of a categorical/ordinal attribute, if it has one.
 *
 * The stored operand is compared against these values, so they keep the type
 * the codebook authored them with — coercing a numeric option to a string
 * here would save a rule that no longer matches anything.
 */
export const ruleVariableChoices = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
): RuleChoiceOption[] | undefined => {
  const variable = ruleVariable(variables, variableId);
  // Only these two kinds of attribute have a set of choices a rule's operand
  // is picked FROM. A boolean variable also carries `options`, but they are
  // the labels its input control puts on true and false — offering them as
  // rule operands would save a rule comparing an attribute against the word
  // its control happens to print.
  if (variable?.type !== 'categorical' && variable?.type !== 'ordinal') {
    return undefined;
  }
  const choices = variable.options.map(({ value, label }) => ({
    value,
    label: label === '' ? String(value) : label,
  }));
  return choices.length > 0 ? choices : undefined;
};

/**
 * The operators offered for an attribute of this type. A rule with no
 * attribute yet — a presence rule, or a variable rule mid-authoring — gets the
 * existence operators, which is what `operatorsByType.exists` holds.
 */
export const ruleOperatorOptions = (
  variableType: VariableType | undefined,
): RuleOperatorOption[] => {
  const allowed =
    variableType === undefined
      ? operatorsByType.exists
      : operatorsByType[variableType];
  return operatorsAsOptions.filter((option) => allowed.has(option.value));
};

export const isOperatorAllowedForType = (
  operator: FilterOperator,
  variableType: VariableType | undefined,
): boolean =>
  (variableType === undefined
    ? operatorsByType.exists
    : operatorsByType[variableType]
  ).has(operator);

/**
 * The node or edge types a rule may be pointed at, in codebook order.
 *
 * An edge definition's colour is optional in the schema, so a missing one
 * falls back to the first sequence colour rather than leaving the chip
 * untinted.
 */
export const ruleEntityTypeOptions = (
  codebook: Readonly<Codebook>,
  target: RuleEntityTarget,
): RuleEntityTypeOption[] => {
  if (target === 'edge') {
    return Object.entries(codebook.edge ?? {}).map(([value, definition]) => ({
      value,
      label: definition.name === '' ? value : definition.name,
      color: definition.color ?? DEFAULT_EDGE_COLOR,
    }));
  }

  return Object.entries(codebook.node ?? {}).map(([value, definition]) => ({
    value,
    label: definition.name === '' ? value : definition.name,
    color: definition.color,
    shape: definition.shape.default,
  }));
};
