import {
  type Codebook,
  type ColorReference,
  type NodeShape,
  OperatorsByVariableType,
  type Variable,
  type Variables,
  type VariableType,
} from '@codaco/protocol-validation';

import {
  isFilterOperator,
  isRuleVariableType,
  operatorsAsOptions,
  operatorsByType,
  operatorsWithOptionCount,
  operatorsWithRegExp,
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
 * The shape of ANSWER each kind of attribute is recorded as, which is the
 * shape an operand has to have to be compared against one.
 *
 * `list` is a multi-select's set of chosen option values; `option` is one of
 * them; `number` and `text` are what they say. Read off the interview's own
 * comparison — deep equality against the stored answer — rather than off the
 * control the editor happens to render, because it is the runtime that decides
 * whether a rule can ever match.
 */
type OperandShape = 'boolean' | 'list' | 'number' | 'option' | 'text';

const OPERAND_SHAPES: Readonly<Record<VariableType, OperandShape>> =
  Object.freeze({
    boolean: 'boolean',
    categorical: 'list',
    ordinal: 'option',
    number: 'number',
    scalar: 'number',
    // Recorded as an ISO string, and compared as one.
    datetime: 'text',
    text: 'text',
    location: 'text',
    layout: 'text',
  });

/** The operators that compare two values by magnitude. */
const RELATIONAL_OPERATORS: ReadonlySet<string> = new Set([
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
]);

/**
 * Whether the runtime could resolve this operand to a point on a scale.
 *
 * Mirrors the interview's own reading: a number as itself, a numeric string as
 * its number, and any other string as the date it parses to. Nothing else is
 * comparable by magnitude, so nothing else can satisfy a relational rule.
 */
const isComparableByMagnitude = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || value.trim() === '') return false;
  return !Number.isNaN(Number(value)) || !Number.isNaN(Date.parse(value));
};

/** What each of those shapes looks like as a stored value. */
const HAS_OPERAND_SHAPE: Readonly<
  Record<OperandShape, (value: unknown) => boolean>
> = Object.freeze({
  boolean: (value) => typeof value === 'boolean',
  list: (value) => Array.isArray(value),
  number: (value) => typeof value === 'number' && Number.isFinite(value),
  option: (value) => typeof value === 'string' || typeof value === 'number',
  text: (value) => typeof value === 'string',
});

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
  if (operator === 'EXISTS' || operator === 'NOT_EXISTS') return true;
  if (value === undefined || value === null) return true;

  // An option count is a number whatever kind of attribute is being counted,
  // and `OPTIONS_EQUALS` compares it identically — a string that merely looks
  // like one never matches.
  if (operatorsWithOptionCount.has(operator)) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  // A pattern is a string before it is anything else.
  if (operatorsWithRegExp.has(operator)) return typeof value === 'string';
  if (RELATIONAL_OPERATORS.has(operator)) {
    return isComparableByMagnitude(value);
  }
  // `INCLUDES`/`EXCLUDES` ask whether a selection holds an option, and the
  // runtime takes either one option or a list of them — so a rule authored
  // before the editor emitted a list still matches.
  if (operator === 'INCLUDES' || operator === 'EXCLUDES') {
    return (
      Array.isArray(value) ||
      typeof value === 'string' ||
      typeof value === 'number'
    );
  }
  return HAS_OPERAND_SHAPE[OPERAND_SHAPES[variableType]](value);
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
