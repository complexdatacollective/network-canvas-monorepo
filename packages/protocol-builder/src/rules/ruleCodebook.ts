import {
  type Codebook,
  type ColorReference,
  DATE_FORMATS_KEYS,
  type DateFormat,
  DEFAULT_TYPE as DEFAULT_DATE_FORMAT,
  type NodeShape,
  OperatorsByVariableType,
  type Variable,
  type Variables,
  type VariableType,
} from '@codaco/protocol-validation';

import {
  canAuthorRuleForType,
  isFilterOperator,
  isVariableType,
  operandDrawsOnOptions,
  operandRequirement,
  operatorsAsOptions,
  operatorsForSubject,
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

/**
 * What a codebook definition is called, or the id it is filed under when it
 * has no name of its own.
 *
 * The schema requires a `name` on a node type, an edge type and a variable
 * alike, but an EMPTY one satisfies it — and an empty name is not a name: it
 * leaves the rule sentence reading "exists", and the edit and delete controls
 * of the row it describes named after nothing at all. One helper for every
 * reader of a codebook name, because the type list the editor offers and the
 * sentence a host prints have to call the same definition the same thing.
 */
export const codebookLabel = (
  name: string | undefined,
  fallback: string,
): string => (name === undefined || name === '' ? fallback : name);

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

/** Only attribute types a rule can actually be built against are offered. */
export const ruleVariableOptions = (
  variables: Readonly<Variables>,
): RuleVariableOption[] =>
  Object.entries(variables).flatMap<RuleVariableOption>(
    ([variableId, definition]) => {
      const type: unknown = definition.type;
      if (!canAuthorRuleForType(type)) return [];
      return [
        {
          value: variableId,
          label: codebookLabel(definition.name, variableId),
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

/**
 * The type the codebook gives this attribute, whether or not a rule could be
 * BUILT against one.
 *
 * Every type the schema has answers here, including one the editor offers no
 * operator for: a protocol may already hold a rule against a layout attribute,
 * and reading its type as unknown would report it as an attribute the codebook
 * has lost rather than as the operand problem it is.
 */
export const ruleVariableType = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
): VariableType | undefined => {
  const type: unknown = ruleVariable(variables, variableId)?.type;
  return isVariableType(type) ? type : undefined;
};

/**
 * The resolution a datetime attribute's answers are recorded at.
 *
 * A rule's operand is compared against the stored answer verbatim, so the date
 * control has to offer the same resolution the attribute's own picker does: a
 * year-resolution answer is `"1994"`, and a full date entered beside it equals
 * nothing. `full` is the schema's own default when the variable names none.
 */
export const ruleVariableDateResolution = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
): DateFormat => {
  const variable = ruleVariable(variables, variableId);
  if (variable?.type !== 'datetime') return DEFAULT_DATE_FORMAT;
  // Read structurally: only one of the two datetime variable shapes carries a
  // resolution at all, and a relative date picker records a full date.
  const parameters: unknown = Reflect.get(variable, 'parameters');
  if (typeof parameters !== 'object' || parameters === null) {
    return DEFAULT_DATE_FORMAT;
  }
  const resolution: unknown = Reflect.get(parameters, 'type');
  return isDateFormat(resolution) ? resolution : DEFAULT_DATE_FORMAT;
};

const DATE_FORMAT_NAMES: ReadonlySet<string> = new Set(DATE_FORMATS_KEYS);

const isDateFormat = (value: unknown): value is DateFormat =>
  typeof value === 'string' && DATE_FORMAT_NAMES.has(value);

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
 * existence operators, which is what the `exists` subject holds.
 */
export const ruleOperatorOptions = (
  variableType: VariableType | undefined,
): RuleOperatorOption[] => {
  const allowed =
    variableType === undefined
      ? operatorsForSubject('exists')
      : operatorsForSubject(variableType);
  return operatorsAsOptions.filter((option) => allowed.has(option.value));
};

/**
 * Whether the protocol schema accepts this operator against an attribute of
 * this type.
 *
 * Read from the schema's own table rather than from the set the editor offers,
 * which is deliberately narrower: a stored protocol may hold an attribute-level
 * `EXISTS` that today's editor would not build, and reporting a rule the schema
 * accepts as broken would send the researcher to fix something that is not
 * wrong. Answers `true` for an attribute whose type is unknown — a deleted
 * attribute is reported as deleted, and nothing is known about what its
 * operator ought to be.
 */
export const isOperatorValidForAttributeType = (
  operator: string,
  variableType: VariableType | undefined,
): boolean => {
  if (variableType === undefined) return true;
  const allowed = OperatorsByVariableType[variableType];
  return allowed === undefined || allowed.includes(operator);
};

/**
 * Whether the stored operand is something the interview could ever compare
 * against an attribute of this type.
 *
 * The companion to `isOperatorValidForAttributeType`, and needed beside it
 * because an operator can survive a retype that its operand cannot: `EXACTLY`
 * is legal for a number and for a categorical alike, but a number answers with
 * a number and a categorical answers with the list of options that were
 * selected, so the operand a collaborator's retype leaves behind compares
 * against nothing. The protocol schema accepts a number, a string, a boolean
 * or a list at `value` whatever the attribute is, so the builder is the only
 * place this can be caught.
 *
 * Read off the same operand table the editor's controls are, so a value this
 * accepts is exactly a value the editor could have committed — and a rule the
 * schema has no operand for at all (a comparison against a layout attribute,
 * whose answer is a point) is reported rather than passed as text.
 *
 * Answers `true` wherever nothing is known or nothing is compared: an
 * attribute the codebook has lost, an operator outside the schema's set, an
 * existence operator, and an operand that is simply absent — which is an
 * unfinished rule, reported as one.
 */
export const isOperandValidForAttributeType = (
  operator: string,
  variableType: VariableType | undefined,
  value: unknown,
): boolean => {
  if (variableType === undefined) return true;
  if (!isFilterOperator(operator)) return true;

  const requirement = operandRequirement(variableType, operator);
  // No operand the protocol can hold for this pair at all, so whatever is
  // stored there compares against nothing.
  if (requirement === undefined) return false;
  if (requirement.kind === 'none') return true;
  if (value === undefined || value === null) return true;
  return requirement.holds(value);
};

/**
 * The option values this rule names that its attribute no longer offers.
 *
 * The third way the codebook can move under a rule, and the one neither
 * `isOperatorValidForAttributeType` nor `isOperandValidForAttributeType`
 * catches: the attribute is still there, still option-bearing, and the operand
 * is still the SHAPE an option has — it is simply no longer one of the options
 * the attribute authors, because a collaborator renamed or deleted it. Nothing
 * about the rule looks wrong; it just cannot match an answer any participant
 * can give.
 *
 * Compared by identity against the values the codebook holds, which is how the
 * interview compares them: the option whose value is the number `1` is not
 * matched by the string `"1"`, and `ruleVariableChoices` keeps the authored
 * type for exactly this reason.
 *
 * Returns the offending values rather than a verdict, so a caller can say
 * which option went missing. Empty for every comparison whose operand is not
 * picked from an option list at all, and for an operand that is not there yet
 * — an unfinished rule is reported as unfinished.
 */
export const missingOperandOptions = (
  variables: Readonly<Variables>,
  variableId: string | undefined,
  operator: string,
  value: unknown,
): (string | number)[] => {
  const variableType = ruleVariableType(variables, variableId);
  if (!operandDrawsOnOptions(variableType, operator)) return [];

  const authored = new Set<string | number>(
    (ruleVariableChoices(variables, variableId) ?? []).map(
      (choice) => choice.value,
    ),
  );
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items.filter(
    (item): item is string | number =>
      (typeof item === 'string' || typeof item === 'number') &&
      !authored.has(item),
  );
};

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
      label: codebookLabel(definition.name, value),
      color: definition.color ?? DEFAULT_EDGE_COLOR,
    }));
  }

  return Object.entries(codebook.node ?? {}).map(([value, definition]) => ({
    value,
    label: codebookLabel(definition.name, value),
    color: definition.color,
    shape: definition.shape.default,
  }));
};
