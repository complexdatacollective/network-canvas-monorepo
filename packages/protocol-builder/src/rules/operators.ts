import {
  AllOperators,
  type FilterOperandKind,
  FilterOperandKinds,
  type FilterOperator,
  filterValueSchema,
  OperatorsByVariableType,
  TypeLevelOperators,
  type VariableType,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

/**
 * How each operator reads in the researcher's own words, in the order the
 * editor offers them.
 *
 * Whole phrases, not fragments assembled around the operand: "is greater than
 * or exactly" is one string a translator can move around its operand, while
 * "is" + "greater than" + "or exactly" is three that only compose in English.
 */
const OPERATOR_LABELS: readonly (readonly [FilterOperator, string])[] = [
  ['EXACTLY', 'is exactly'],
  ['EXISTS', 'exists'],
  ['NOT_EXISTS', 'does not exist'],
  ['NOT', 'is not'],
  ['GREATER_THAN', 'is greater than'],
  ['GREATER_THAN_OR_EQUAL', 'is greater than or exactly'],
  ['LESS_THAN', 'is less than'],
  ['LESS_THAN_OR_EQUAL', 'is less than or exactly'],
  ['CONTAINS', 'contains'],
  ['DOES_NOT_CONTAIN', 'does not contain'],
  ['INCLUDES', 'includes'],
  ['EXCLUDES', 'excludes'],
  ['OPTIONS_GREATER_THAN', 'number of selected options is greater than'],
  ['OPTIONS_LESS_THAN', 'number of selected options is less than'],
  ['OPTIONS_EQUALS', 'number of selected options is exactly'],
  ['OPTIONS_NOT_EQUALS', 'number of selected options is not'],
];

export type RuleOperatorOption = Readonly<{
  value: FilterOperator;
  label: string;
}>;

export const operatorsAsOptions: readonly RuleOperatorOption[] =
  OPERATOR_LABELS.map(([value, label]) => Object.freeze({ value, label }));

const OPERATOR_NAMES: ReadonlySet<string> = new Set(AllOperators.options);

export const isFilterOperator = (value: unknown): value is FilterOperator =>
  typeof value === 'string' && OPERATOR_NAMES.has(value);

/**
 * The operators that ask only whether something is there.
 *
 * The schema's own type-level set: exactly the operators a rule with no
 * attribute may use, and the only ones that compare no operand at all.
 */
const PRESENCE_OPERATORS: ReadonlySet<FilterOperator> = new Set(
  TypeLevelOperators.options,
);

const operatorsOfKind = (
  kind: FilterOperandKind,
): ReadonlySet<FilterOperator> =>
  new Set(
    AllOperators.options.filter(
      (operator) => FilterOperandKinds[operator] === kind,
    ),
  );

/**
 * Operators whose operand is a regular expression rather than a literal.
 *
 * Load-bearing beyond the editor's hint: the preview must not render these
 * operands as Markdown, because Markdown eats the very characters that make
 * one a pattern. They are the schema's `string`-operand operators — the only
 * ones it constrains to text whatever the attribute is, which is what being a
 * pattern means.
 */
export const operatorsWithRegExp: ReadonlySet<FilterOperator> =
  operatorsOfKind('string');

/** Operators whose operand counts selected options rather than comparing one. */
export const operatorsWithOptionCount: ReadonlySet<FilterOperator> =
  operatorsOfKind('integer');

/**
 * Operators that ask whether an answer CONTAINS an option rather than whether
 * it equals one.
 *
 * A runtime fact rather than a schema one, and the reason it is stated: the
 * interview's predicate takes either a single option or a list of them for
 * these two and resolves the difference itself, so a rule authored before the
 * editor emitted a list still matches. Equality has no such latitude.
 */
const MEMBERSHIP_OPERATORS: ReadonlySet<FilterOperator> =
  new Set<FilterOperator>(['INCLUDES', 'EXCLUDES']);

/**
 * The SHAPE an attribute of each type is answered with, which is the shape an
 * operand compared against one has to have.
 *
 * Read off the interview's own record of an answer (`VariableValueSchema` in
 * shared-consts, and the predicates in `@codaco/network-query` that compare
 * against it) rather than off the control the editor happens to render,
 * because it is the runtime that decides whether a rule can ever match: every
 * operator the schema leaves to the attribute compares the operand against the
 * stored answer, by deep equality or by membership.
 *
 * `point` is a layout answer — `{ x, y }` — and is named here so that the fact
 * a rule cannot be authored against one is DERIVED below rather than asserted.
 */
type AnswerShape =
  | 'boolean'
  | 'number'
  | 'text'
  | 'date'
  | 'option'
  | 'optionList'
  | 'point';

const ANSWER_SHAPES: Readonly<Record<VariableType, AnswerShape>> =
  Object.freeze({
    boolean: 'boolean',
    number: 'number',
    // A normalised reading on a scale, recorded as a number.
    scalar: 'number',
    text: 'text',
    // An ISO date string, at the resolution the variable's picker is set to.
    datetime: 'date',
    // One authored option value; a multi-select records the list of them.
    ordinal: 'option',
    categorical: 'optionList',
    // A place the participant named, recorded as text.
    location: 'text',
    layout: 'point',
  });

/** Whether the protocol schema can hold this as a rule's comparison value. */
const isStorableOperand = (value: unknown): boolean =>
  filterValueSchema.safeParse(value).success;

/** The control a rule's operand is entered with. */
export type OperandControl =
  | 'boolean'
  | 'wholeNumber'
  | 'decimalNumber'
  | 'text'
  | 'pattern'
  | 'date'
  | 'option'
  | 'optionList';

/**
 * The controls that could enter an answer of each shape, best first, each with
 * a value it would produce.
 *
 * The schema is ASKED about that value rather than told: a control whose
 * output `filterValueSchema` refuses is not offered, and the next candidate is
 * tried. That is what decides between the two numeric controls — a decimal
 * where the protocol carries fractions, a whole number where it does not —
 * and it means widening or narrowing the schema changes the control the
 * researcher meets instead of leaving one that commits a value the validator
 * refuses.
 *
 * A point has no candidate at all: no control enters `{ x, y }` as a rule
 * operand, and the schema could not hold what one produced. That is why a
 * layout attribute ends up with no comparison to offer.
 */
type OperandCandidate = Readonly<{
  control: OperandControl;
  example: unknown;
}>;

const ANSWER_OPERANDS: Readonly<
  Record<AnswerShape, readonly OperandCandidate[]>
> = Object.freeze({
  boolean: [{ control: 'boolean', example: true }],
  number: [
    { control: 'decimalNumber', example: 0.5 },
    { control: 'wholeNumber', example: 1 },
  ],
  text: [{ control: 'text', example: 'text' }],
  date: [{ control: 'date', example: '2020-01-01' }],
  option: [{ control: 'option', example: 'option' }],
  optionList: [{ control: 'optionList', example: ['option'] }],
  point: [],
});

const controlForShape = (shape: AnswerShape): OperandControl | undefined =>
  ANSWER_OPERANDS[shape].find(({ example }) => isStorableOperand(example))
    ?.control;

/** What a rule's operand may be, once it has been read back out of a field. */
export type OperandValue =
  | boolean
  | number
  | string
  | (string | number)[]
  | undefined;

/**
 * How a rule's operand behaves, for one attribute type and one operator.
 *
 * Every decision about an operand is taken here and nowhere else: which
 * control the researcher is given, what the field is reset to when the choice
 * above it changes, how a stored value is read back into that control, and
 * whether a value already in the protocol is one the interview could compare.
 * Splitting those across the control, the cascade and the validator is how a
 * type came to be given a text box for an operand the schema refuses.
 */
export type OperandRequirement =
  /** A presence operator: there is no operand to enter. */
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'value';
      control: OperandControl;
      /** How the schema constrains this operand, in its own words. */
      operandKind: FilterOperandKind;
      /** What the field holds before anything has been entered. */
      empty: OperandValue;
      /** A seeded value read back into this control. */
      parse: (value: unknown) => OperandValue;
      /** Whether a stored operand is one the interview could compare. */
      holds: (value: unknown) => boolean;
    }>;

const PRESENCE_REQUIREMENT: OperandRequirement = Object.freeze({
  kind: 'none' as const,
});

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
};

const asOption = (value: unknown): string | number =>
  typeof value === 'string' || typeof value === 'number' ? value : '';

/**
 * A multi-select operand is the set of selected option values, so anything
 * that is not one of those survives the trip only as noise. Non-primitive
 * members are dropped rather than stringified.
 */
const asSelection = (value: unknown): (string | number)[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string | number =>
          typeof item === 'string' || typeof item === 'number',
      )
    : [];

const isFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);

const isText = (value: unknown): boolean => typeof value === 'string';

/**
 * What each control empties to, reads a seeded value with, and accepts.
 *
 * `undefined` is the empty numeric operand rather than `''`: an empty string
 * is not a number, and parking one there would put a value the interview
 * cannot compare into a field whose control would then show it as text.
 */
const OPERAND_CONTROLS: Readonly<
  Record<
    OperandControl,
    Readonly<{
      empty: OperandValue;
      parse: (value: unknown) => OperandValue;
      holds: (value: unknown) => boolean;
    }>
  >
> = Object.freeze({
  boolean: {
    empty: false,
    parse: (value) => value === true,
    holds: (value) => typeof value === 'boolean',
  },
  wholeNumber: {
    empty: undefined,
    parse: asNumber,
    holds: (value) => isFiniteNumber(value) && Number.isInteger(value),
  },
  decimalNumber: { empty: undefined, parse: asNumber, holds: isFiniteNumber },
  text: { empty: '', parse: asText, holds: isText },
  pattern: { empty: '', parse: asText, holds: isText },
  date: { empty: '', parse: asText, holds: isText },
  option: {
    empty: '',
    parse: asOption,
    holds: (value) => typeof value === 'string' || typeof value === 'number',
  },
  optionList: { empty: [], parse: asSelection, holds: Array.isArray },
});

const valueRequirement = (
  control: OperandControl,
  operandKind: FilterOperandKind,
  operator: FilterOperator,
): OperandRequirement =>
  Object.freeze({
    kind: 'value' as const,
    control,
    operandKind,
    ...OPERAND_CONTROLS[control],
    ...(MEMBERSHIP_OPERATORS.has(operator)
      ? {
          holds: (value: unknown) =>
            Array.isArray(value) ||
            typeof value === 'string' ||
            typeof value === 'number',
        }
      : {}),
  });

/**
 * The operand for one attribute type and one operator, or `undefined` when the
 * protocol cannot hold one.
 *
 * `undefined` is not a gap: it is the answer for a comparison the schema has
 * no value for, and it is what keeps such an operator off the editor's list
 * rather than giving the researcher a control whose every entry the validator
 * refuses. Two cases exist today — a layout attribute, whose answer is a point
 * and whose comparison therefore has no storable operand, and a relational
 * comparison against anything the interview does not record as a number.
 */
export const operandRequirement = (
  variableType: VariableType | undefined,
  operator: unknown,
): OperandRequirement | undefined => {
  if (!isFilterOperator(operator)) return undefined;
  const operandKind = FilterOperandKinds[operator];
  if (operandKind === 'none') return PRESENCE_REQUIREMENT;
  if (operandKind === 'integer') {
    return valueRequirement('wholeNumber', operandKind, operator);
  }
  // Only the pattern operators are constrained to text whatever the attribute
  // is, and a pattern is entered as text however the attribute is answered.
  if (operandKind === 'string') {
    return valueRequirement('pattern', operandKind, operator);
  }

  const shape =
    variableType === undefined ? 'text' : ANSWER_SHAPES[variableType];

  // The schema requires a number for a relational comparison, so it can only
  // be offered where the ANSWER is a number too: a date answer compared
  // against a number is a comparison the researcher cannot express, and a date
  // STRING beside a relational operator is a value the validator refuses.
  if (operandKind === 'number' && shape !== 'number') return undefined;

  const control = controlForShape(shape);
  if (control === undefined) return undefined;
  return valueRequirement(control, operandKind, operator);
};

/**
 * Whether this comparison's operand is PICKED FROM the attribute's own
 * authored options rather than typed out.
 *
 * Read off the operand table above — the controls that enter an option, one or
 * several — so the comparisons whose operand has to BE an option are exactly
 * the ones the editor offers an option picker for, and adding an
 * option-answered attribute type to `ANSWER_SHAPES` brings this with it.
 *
 * Only the fact is stated here. WHICH options an attribute authored is a
 * question about the codebook, and this module deliberately knows nothing
 * about one; `missingOperandOptions` in `ruleCodebook.ts` asks it.
 */
export const operandDrawsOnOptions = (
  variableType: VariableType | undefined,
  operator: unknown,
): boolean => {
  const requirement = operandRequirement(variableType, operator);
  if (requirement === undefined || requirement.kind === 'none') return false;
  return (
    requirement.control === 'option' || requirement.control === 'optionList'
  );
};

/**
 * The operators the editor OFFERS for an attribute of each type.
 *
 * Three narrowings of the schema's own `OperatorsByVariableType`, in order:
 *
 * 1. the schema's list for the type, which is what a stored protocol may hold;
 * 2. minus the presence operators, which an ATTRIBUTE rule does not offer — an
 *    attribute a participant has not answered is already covered by the
 *    presence rule above it, and a protocol authored before may still hold one;
 * 3. minus every operator the protocol has no operand for, which is what keeps
 *    a layout attribute from being offered a comparison no entry could satisfy
 *    and a date from being offered one the validator refuses.
 *
 * `exists` is not a variable type. It is the set offered when no attribute has
 * been chosen — a presence rule about the entity itself.
 */
const offeredOperators = (
  variableType: VariableType,
): ReadonlySet<FilterOperator> => {
  const allowed = OperatorsByVariableType[variableType];
  if (allowed === undefined) return new Set();
  return new Set(
    AllOperators.options.filter(
      (operator) =>
        allowed.includes(operator) &&
        !PRESENCE_OPERATORS.has(operator) &&
        operandRequirement(variableType, operator) !== undefined,
    ),
  );
};

/**
 * What a rule's operator list is chosen for: an attribute of a given type, or
 * — before any attribute has been chosen — the entity itself.
 */
export type RuleOperatorSubject = VariableType | 'exists';

const OFFERED_OPERATORS: ReadonlyMap<
  RuleOperatorSubject,
  ReadonlySet<FilterOperator>
> = new Map<RuleOperatorSubject, ReadonlySet<FilterOperator>>([
  ...VariableTypesKeys.map((type) => [type, offeredOperators(type)] as const),
  ['exists', PRESENCE_OPERATORS],
]);

const NO_OPERATORS: ReadonlySet<FilterOperator> = new Set();

export const operatorsForSubject = (
  subject: RuleOperatorSubject,
): ReadonlySet<FilterOperator> =>
  OFFERED_OPERATORS.get(subject) ?? NO_OPERATORS;

/**
 * Whether the chosen operator needs an operand entered beside it.
 *
 * Asked without an attribute type because completeness is asked of a DRAFT,
 * which may not have one yet: whether an operand is wanted at all is decided
 * by the operator, and only its shape by the attribute.
 */
export const operatorNeedsOperand = (operator: unknown): boolean =>
  isFilterOperator(operator) && FilterOperandKinds[operator] !== 'none';

/**
 * The attribute types a rule may be built against.
 *
 * Derived from the schema's own variable-type catalogue and from the operand
 * table above: a type with no operator left to offer is a type no rule can ask
 * anything about, and offering it would put an attribute in the picker whose
 * operator list is empty.
 */
export const ruleVariableTypes: readonly VariableType[] =
  VariableTypesKeys.filter((type) => operatorsForSubject(type).size > 0);

const RULE_VARIABLE_TYPE_NAMES: ReadonlySet<string> = new Set(
  ruleVariableTypes,
);

/** Whether a rule can be authored against an attribute of this type. */
export const canAuthorRuleForType = (value: unknown): value is VariableType =>
  typeof value === 'string' && RULE_VARIABLE_TYPE_NAMES.has(value);

const VARIABLE_TYPE_NAMES: ReadonlySet<string> = new Set(VariableTypesKeys);

/**
 * Compared as plain strings so the guard needs no assertion: membership in the
 * schema's own catalogue IS what makes a string a variable type.
 *
 * Deliberately wider than `canAuthorRuleForType`. A rule the editor would not
 * build today may still be IN a protocol — one against a layout attribute, for
 * instance — and reading its attribute's type as unknown would report it as a
 * deleted attribute rather than as the operand problem it is.
 */
export const isVariableType = (value: unknown): value is VariableType =>
  typeof value === 'string' && VARIABLE_TYPE_NAMES.has(value);
