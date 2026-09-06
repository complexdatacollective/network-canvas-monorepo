import { createAppIntl, defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
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
 * How each operator reads in the researcher's own words.
 *
 * Whole phrases, not fragments assembled around the operand: "is greater than
 * or exactly" is one string a translator can move around its operand, while
 * "is" + "greater than" + "or exactly" is three that only compose in English.
 *
 * A total mapping over the schema's own operator set rather than a list of the
 * ones this editor happens to know: an operator added to `AllOperators` and
 * not named here used to disappear from the list the researcher is offered
 * with nothing to say so, because a list can be short and still typecheck.
 * Keyed on the schema's own token, which is what keeps that check available
 * now the phrases are message descriptors.
 */
const OPERATOR_LABELS = defineMessages({
  EXACTLY: {
    id: 'protocolBuilder.operators.exactly',
    defaultMessage: 'is exactly',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with exactly this value. Read as a whole phrase before the value being compared against.',
  },
  EXISTS: {
    id: 'protocolBuilder.operators.exists',
    defaultMessage: 'exists',
    description:
      'Researcher-facing name for the rule operator that matches when the thing being asked about is present in the interview network at all. Compares no value.',
  },
  NOT_EXISTS: {
    id: 'protocolBuilder.operators.notExists',
    defaultMessage: 'does not exist',
    description:
      'Researcher-facing name for the rule operator that matches when the thing being asked about is absent from the interview network. Compares no value.',
  },
  NOT: {
    id: 'protocolBuilder.operators.not',
    defaultMessage: 'is not',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with anything other than this value. Read as a whole phrase before the value being compared against.',
  },
  GREATER_THAN: {
    id: 'protocolBuilder.operators.greaterThan',
    defaultMessage: 'is greater than',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with a number above this value. Read as a whole phrase before the value being compared against.',
  },
  GREATER_THAN_OR_EQUAL: {
    id: 'protocolBuilder.operators.greaterThanOrEqual',
    defaultMessage: 'is greater than or exactly',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with a number above this value or equal to it. Read as a whole phrase before the value being compared against.',
  },
  LESS_THAN: {
    id: 'protocolBuilder.operators.lessThan',
    defaultMessage: 'is less than',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with a number below this value. Read as a whole phrase before the value being compared against.',
  },
  LESS_THAN_OR_EQUAL: {
    id: 'protocolBuilder.operators.lessThanOrEqual',
    defaultMessage: 'is less than or exactly',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with a number below this value or equal to it. Read as a whole phrase before the value being compared against.',
  },
  CONTAINS: {
    id: 'protocolBuilder.operators.contains',
    defaultMessage: 'contains',
    description:
      'Researcher-facing name for the rule operator that matches an attribute whose text answer matches a regular expression. Read as a whole phrase before the pattern being compared against.',
  },
  DOES_NOT_CONTAIN: {
    id: 'protocolBuilder.operators.doesNotContain',
    defaultMessage: 'does not contain',
    description:
      'Researcher-facing name for the rule operator that matches an attribute whose text answer does not match a regular expression. Read as a whole phrase before the pattern being compared against.',
  },
  INCLUDES: {
    id: 'protocolBuilder.operators.includes',
    defaultMessage: 'includes',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with one of a chosen set of options. Read as a whole phrase before the options being compared against.',
  },
  EXCLUDES: {
    id: 'protocolBuilder.operators.excludes',
    defaultMessage: 'excludes',
    description:
      'Researcher-facing name for the rule operator that matches an attribute answered with none of a chosen set of options. Read as a whole phrase before the options being compared against.',
  },
  OPTIONS_GREATER_THAN: {
    id: 'protocolBuilder.operators.optionsGreaterThan',
    defaultMessage: 'number of selected options is greater than',
    description:
      'Researcher-facing name for the rule operator that counts how many options a multiple-choice attribute was answered with and matches a count above this number. Read as a whole phrase before the number being compared against.',
  },
  OPTIONS_LESS_THAN: {
    id: 'protocolBuilder.operators.optionsLessThan',
    defaultMessage: 'number of selected options is less than',
    description:
      'Researcher-facing name for the rule operator that counts how many options a multiple-choice attribute was answered with and matches a count below this number. Read as a whole phrase before the number being compared against.',
  },
  OPTIONS_EQUALS: {
    id: 'protocolBuilder.operators.optionsEquals',
    defaultMessage: 'number of selected options is exactly',
    description:
      'Researcher-facing name for the rule operator that counts how many options a multiple-choice attribute was answered with and matches exactly this number. Read as a whole phrase before the number being compared against.',
  },
  OPTIONS_NOT_EQUALS: {
    id: 'protocolBuilder.operators.optionsNotEquals',
    defaultMessage: 'number of selected options is not',
    description:
      'Researcher-facing name for the rule operator that counts how many options a multiple-choice attribute was answered with and matches any count other than this number. Read as a whole phrase before the number being compared against.',
  },
}) satisfies Record<FilterOperator, MessageDescriptor>;

/**
 * The formatter used when a caller has none of its own.
 *
 * Every display surface threads the reader's own `intl` in. This is the
 * fallback for the pure readers a host reaches without an editing session —
 * the printable protocol summary and this package's own module tests — which
 * have a rule and a codebook and nothing else.
 */
const englishIntl = createAppIntl({ locale: 'en' });

export type RuleOperatorOption = Readonly<{
  value: FilterOperator;
  label: string;
  /** Shown so a stored operator is visible, but not offered as a choice. */
  disabled?: boolean;
}>;

/**
 * Every operator, in the schema's own order.
 *
 * Enumerated from `AllOperators` rather than from the label table's key order,
 * so the list is exactly as long as the schema's and cannot be shortened by an
 * editing slip here.
 */
export const operatorsAsOptions = (
  intl: IntlShape = englishIntl,
): readonly RuleOperatorOption[] =>
  AllOperators.options.map((value) =>
    Object.freeze({ value, label: intl.formatMessage(OPERATOR_LABELS[value]) }),
  );

/**
 * How this operator reads, whether or not the editor offers it.
 *
 * Every operator the schema has is named above, so a stored one can always be
 * shown to the researcher in the words the rest of the editor uses rather than
 * as the token the protocol files it under.
 */
export const operatorLabel = (
  operator: FilterOperator,
  intl: IntlShape = englishIntl,
): string => intl.formatMessage(OPERATOR_LABELS[operator]);

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

/**
 * One of them, as a type, so a table keyed on them is total over the schema's
 * set rather than over whichever of them a reader happened to name.
 */
export type PresenceOperator = (typeof TypeLevelOperators.options)[number];

const PRESENCE_OPERATOR_NAMES: ReadonlySet<string> = new Set(
  TypeLevelOperators.options,
);

export const isPresenceOperator = (value: unknown): value is PresenceOperator =>
  typeof value === 'string' && PRESENCE_OPERATOR_NAMES.has(value);

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

/**
 * Whether a pattern operand is one the interview could compile.
 *
 * Asked here rather than only where a pattern is entered, because the
 * interview deliberately never asks: `safeRegExp` in `@codaco/network-query`
 * swallows the compile error so that one malformed rule cannot break
 * navigation, and an uncompilable pattern then quietly matches nothing (or,
 * for `does not contain`, everything) for every participant. Authoring is the
 * only place it can be caught, so it is caught wherever a rule is read rather
 * than only when its own dialog is submitted.
 *
 * Compiled with no flags, exactly as the runtime compiles it.
 */
export const isCompilablePattern = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    // eslint-disable-next-line no-new -- compiling it IS the check
    new RegExp(value);
    return true;
  } catch {
    return false;
  }
};

/** Operators whose operand counts selected options rather than comparing one. */
export const operatorsWithOptionCount: ReadonlySet<FilterOperator> =
  operatorsOfKind('integer');

/**
 * Operators that ask whether an answer is one of a SET of options rather than
 * whether it equals one.
 *
 * A runtime fact rather than a schema one, and the reason it is stated twice
 * over. The interview's predicate takes either a single option or a list of
 * them on EITHER side and resolves the difference itself — so a rule authored
 * before the editor emitted a list still matches, and a list compared against
 * a single-option answer matches when the answer is in the list. Equality has
 * no such latitude.
 *
 * That is why these two, and only these two, decide the operand's shape as
 * well as what counts as a valid one: the set is the operand, whatever shape a
 * single ANSWER has.
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

/**
 * A single-option operand read back into its control.
 *
 * A value no option control can hold opens the control on nothing, which its
 * own `required` then refuses — and `operandOptionProblems` has already
 * reported it on the row, so the researcher is told what is wrong rather than
 * left with an empty control over a rule that looked answered.
 */
const asOption = (value: unknown): string | number =>
  typeof value === 'string' || typeof value === 'number' ? value : '';

/**
 * A multi-select operand is the set of selected option values, so anything
 * that is not one of those survives the trip only as noise. Non-primitive
 * members are dropped rather than stringified — and reported by
 * `operandOptionProblems`, which is what keeps the drop from being silent.
 *
 * A LONE option value is kept rather than dropped. `INCLUDES`/`EXCLUDES`
 * accept one option or a list of them and the interview resolves the
 * difference itself, so a rule authored before this editor emitted a list
 * holds a bare `"happy"` — opening it on an empty selection showed the
 * researcher a choice their rule had already made, and saved the blank back
 * over it.
 */
const asSelection = (value: unknown): (string | number)[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string | number =>
        typeof item === 'string' || typeof item === 'number',
    );
  }
  if (typeof value === 'number') return [value];
  return typeof value === 'string' && value !== '' ? [value] : [];
};

const isFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);

const isText = (value: unknown): boolean => typeof value === 'string';

/**
 * What each control empties to, reads a seeded value with, and accepts.
 *
 * Every empty here has to be a value the form reads as UNANSWERED, because
 * `required` is the only thing standing between an untouched operand and a
 * saved rule — `isUnanswered` in fresco-ui is the shared definition, and
 * `operandTable.test.tsx` holds every control to it. `false` is not one of
 * them: it is what a yes/no control commits for "No", so emptying a boolean
 * operand to it both answered the question on the researcher's behalf and
 * satisfied the rule that exists to ask it. A boolean operand therefore starts
 * at `undefined`, like every numeric one.
 *
 * `undefined` is the empty numeric operand rather than `''` for a related
 * reason: an empty string is not a number, and parking one there would put a
 * value the interview cannot compare into a field whose control would then
 * show it as text.
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
    empty: undefined,
    // Read back as the answer it is, so a stored `false` opens on "No" and a
    // rule with no operand yet opens on neither.
    parse: (value) => (typeof value === 'boolean' ? value : undefined),
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

  const control = controlForShape(operandShape(shape, operator));
  if (control === undefined) return undefined;
  return valueRequirement(control, operandKind, operator);
};

/**
 * The shape the OPERAND takes, which is the answer's shape except where the
 * operator compares against a set.
 *
 * An ordinal attribute is answered with one option and a categorical with the
 * list of options that were selected, so equality against each takes the shape
 * of its own answer. `INCLUDES`/`EXCLUDES` ask something different — whether
 * the answer is among these options — and the interview matches an array
 * operand against a single ordinal answer by membership, so the operand is a
 * set either way.
 *
 * Deriving it here rather than overriding only `holds` is what keeps the
 * single-select control off an operand it cannot hold: an ordinal
 * `INCLUDES ['low', 'high']` is schema-valid and matches at runtime, and the
 * radio group it used to open in read the array as no selection at all —
 * blocking a re-save of the untouched rule on `required`, or, once the
 * researcher picked one option to get past that, saving the one they picked
 * over the set they had.
 */
const operandShape = (
  shape: AnswerShape,
  operator: FilterOperator,
): AnswerShape =>
  MEMBERSHIP_OPERATORS.has(operator) && shape === 'option'
    ? 'optionList'
    : shape;

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
 * about one; `operandOptionProblems` in `ruleCodebook.ts` asks it.
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
 * Whether this comparison's operand is a DATE — one recorded the way the
 * attribute's own picker records dates — rather than text that happens to look
 * like one.
 *
 * Read off the same operand table as `operandDrawsOnOptions`, and for the same
 * reason: the comparisons whose operand has to BE a date are exactly the ones
 * the editor offers a date picker for. A pattern comparison against a datetime
 * attribute is not one of them — its operand is a regular expression, which is
 * text at any resolution.
 *
 * Only the fact is stated here. WHICH dates the attribute can record is a
 * question about the codebook, and this module deliberately knows nothing
 * about one; `operandDateProblems` in `ruleCodebook.ts` asks it.
 */
export const operandIsDate = (
  variableType: VariableType | undefined,
  operator: unknown,
): boolean => {
  const requirement = operandRequirement(variableType, operator);
  if (requirement === undefined || requirement.kind === 'none') return false;
  return requirement.control === 'date';
};

/**
 * The numbers this comparison's own side of the comparison can take.
 *
 * The third thing an attribute's answers are drawn from a KNOWN set rather
 * than being anything of the right type, after its authored options and its
 * date picker's window — and the one that is a number, so it bounds a numeric
 * operand from both ends rather than listing values.
 *
 * Two comparisons have one:
 *
 * - the COUNT of selected options runs from none of them to all of them, so a
 *   categorical attribute offering two options can only ever have 0, 1 or 2
 *   selected — `optionsLength` in `@codaco/network-query` counts the stored
 *   array, and an unanswered attribute counts as none;
 * - a SCALAR answer is a reading on a normalised 0-1 scale. The schema refuses
 *   `minValue`/`maxValue` on a scalar variable for exactly that reason
 *   (`scalarValidations` in protocol-validation's `variable.ts`), so nothing in
 *   a codebook can move the scale, and the interview renders it as a visual
 *   analogue scale from 0 to 1.
 *
 * `undefined` everywhere else, which is not a gap: a number attribute holds
 * whatever quantity the study measures, so nothing bounds a comparison against
 * one, and a comparison that is not against a number has no range at all.
 *
 * The option count is handed in rather than read, for the same reason
 * `operandDrawsOnOptions` states only the fact: which options an attribute
 * authored is a question about the codebook, and this module deliberately
 * knows nothing about one. `operandNumberProblems` in `ruleCodebook.ts` asks
 * it, and `RuleOperandField` bounds its control from the same answer — one
 * statement of the range, so the control a researcher is given and the stored
 * operand the editor reports cannot disagree.
 */
export type OperandNumberRange = Readonly<{
  min: number;
  max: number;
  /** Which of the two ranges this is, so a caller can say so in words. */
  subject: 'optionCount' | 'scale';
}>;

export const operandNumberRange = (
  variableType: VariableType | undefined,
  operator: unknown,
  /** How many options the attribute authors, where it authors any. */
  optionCount: number | undefined,
): OperandNumberRange | undefined => {
  const requirement = operandRequirement(variableType, operator);
  if (requirement === undefined || requirement.kind === 'none')
    return undefined;
  if (requirement.operandKind === 'integer') {
    return optionCount === undefined
      ? undefined
      : { min: 0, max: optionCount, subject: 'optionCount' };
  }
  if (variableType !== 'scalar') return undefined;
  return requirement.control === 'decimalNumber' ||
    requirement.control === 'wholeNumber'
    ? { min: 0, max: 1, subject: 'scale' }
    : undefined;
};

/**
 * Whether any answer inside the range satisfies this comparison, for one
 * operator.
 *
 * Asked of the range rather than of a sample of answers, because the interview
 * compares a number against a number and the answer is anywhere in between:
 * `greater than` is satisfiable exactly when the range reaches above the
 * operand, `less than` when it reaches below it, and equality when the operand
 * is inside it.
 *
 * `ALWAYS` is a decision, not a gap. Those operators are satisfied by an
 * answer that does NOT equal the operand, or compare no number at all, so an
 * operand outside the range makes them match every answer rather than none:
 * `not` and `does not have exactly` beside an impossible number are useless
 * rules, not unmatchable ones, and reporting them would tell a researcher a
 * rule that fires for every participant can never fire at all.
 *
 * A total mapping over the schema's own operator set rather than a switch with
 * a default, in the way `OPERATOR_LABELS` above is one: an operator added to
 * `AllOperators` arrives here as a typecheck failure asking which of the two
 * answers it gives, instead of falling into the catch-all and quietly never
 * being reported.
 */
type RangeComparison = (range: OperandNumberRange, value: number) => boolean;

const ALWAYS: RangeComparison = () => true;

const RANGE_COMPARISONS: Readonly<Record<FilterOperator, RangeComparison>> =
  Object.freeze({
    GREATER_THAN: (range, value) => range.max > value,
    OPTIONS_GREATER_THAN: (range, value) => range.max > value,
    GREATER_THAN_OR_EQUAL: (range, value) => range.max >= value,
    LESS_THAN: (range, value) => range.min < value,
    OPTIONS_LESS_THAN: (range, value) => range.min < value,
    LESS_THAN_OR_EQUAL: (range, value) => range.min <= value,
    EXACTLY: (range, value) => value >= range.min && value <= range.max,
    OPTIONS_EQUALS: (range, value) => value >= range.min && value <= range.max,
    NOT: ALWAYS,
    OPTIONS_NOT_EQUALS: ALWAYS,
    INCLUDES: ALWAYS,
    EXCLUDES: ALWAYS,
    CONTAINS: ALWAYS,
    DOES_NOT_CONTAIN: ALWAYS,
    EXISTS: ALWAYS,
    NOT_EXISTS: ALWAYS,
  });

export const rangeSatisfiesComparison = (
  operator: FilterOperator,
  range: OperandNumberRange,
  value: number,
): boolean => RANGE_COMPARISONS[operator](range, value);

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
