import {
  type FilterOperator,
  type VariableType,
  VariableTypesKeys,
} from '@codaco/protocol-validation';

/**
 * Which attribute types a rule may be built against.
 *
 * Derived from the schema's own variable-type catalogue rather than from a
 * host's display configuration: Architect's `VARIABLE_TYPES` carries a label,
 * a colour and an imported SVG for each type, and reading the allowed set out
 * of it made a list of operators depend on a bundle of icon assets.
 *
 * Every type the schema has is currently comparable, so the exclusion list is
 * empty — it stays because "no type is excluded" is a fact worth being able
 * to change in one place.
 */
const EXCLUDED_RULE_VARIABLE_TYPES = new Set<VariableType>([]);

export const ruleVariableTypes: readonly VariableType[] =
  VariableTypesKeys.filter((type) => !EXCLUDED_RULE_VARIABLE_TYPES.has(type));

/**
 * Compared as plain strings so the guard needs no assertion: membership in
 * this set IS what makes a string one of the schema's rule-comparable types.
 */
const RULE_VARIABLE_TYPE_NAMES: ReadonlySet<string> = new Set(
  ruleVariableTypes,
);

export const isRuleVariableType = (value: unknown): value is VariableType =>
  typeof value === 'string' && RULE_VARIABLE_TYPE_NAMES.has(value);

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

/** Operators that compare the attribute against an operand the author enters. */
export const operatorsWithValue: ReadonlySet<FilterOperator> = new Set([
  'EXACTLY',
  'NOT',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'INCLUDES',
  'EXCLUDES',
]);

/**
 * Operators whose operand is a regular expression rather than a literal.
 *
 * Load-bearing beyond the editor's hint: the preview must not render these
 * operands as Markdown, because Markdown eats the very characters that make
 * one a pattern.
 */
export const operatorsWithRegExp: ReadonlySet<FilterOperator> = new Set([
  'CONTAINS',
  'DOES_NOT_CONTAIN',
]);

/** Operators whose operand counts selected options rather than comparing one. */
export const operatorsWithOptionCount: ReadonlySet<FilterOperator> = new Set([
  'OPTIONS_GREATER_THAN',
  'OPTIONS_LESS_THAN',
  'OPTIONS_EQUALS',
  'OPTIONS_NOT_EQUALS',
]);

const NUMERIC_OPERATORS: readonly FilterOperator[] = [
  'EXACTLY',
  'NOT',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
];

/**
 * The operators the editor OFFERS for an attribute of each type.
 *
 * Deliberately narrower than the schema's `OperatorsByVariableType`, which
 * says what a stored protocol may legally contain. An existing protocol may
 * hold an attribute-level `EXISTS`; the editor does not offer one, because an
 * attribute a participant has not answered is already covered by the presence
 * rule above it. Widening this set would change which rules can be authored,
 * so it is stated here rather than borrowed from the validator.
 *
 * `exists` is not a variable type. It is the set offered when no attribute has
 * been chosen — a presence rule about the entity itself.
 */
export const operatorsByType: Readonly<
  Record<VariableType | 'exists', ReadonlySet<FilterOperator>>
> = Object.freeze({
  text: new Set<FilterOperator>([
    'EXACTLY',
    'NOT',
    'CONTAINS',
    'DOES_NOT_CONTAIN',
  ]),
  number: new Set(NUMERIC_OPERATORS),
  scalar: new Set(NUMERIC_OPERATORS),
  datetime: new Set(NUMERIC_OPERATORS),
  boolean: new Set<FilterOperator>(['EXACTLY', 'NOT']),
  location: new Set<FilterOperator>(['EXACTLY', 'NOT']),
  layout: new Set<FilterOperator>(['EXACTLY', 'NOT']),
  ordinal: new Set<FilterOperator>(['EXACTLY', 'NOT', 'INCLUDES', 'EXCLUDES']),
  categorical: new Set<FilterOperator>([
    'EXACTLY',
    'NOT',
    'INCLUDES',
    'EXCLUDES',
    'OPTIONS_GREATER_THAN',
    'OPTIONS_LESS_THAN',
    'OPTIONS_EQUALS',
    'OPTIONS_NOT_EQUALS',
  ]),
  exists: new Set<FilterOperator>(['EXISTS', 'NOT_EXISTS']),
});

export const isFilterOperator = (value: unknown): value is FilterOperator =>
  typeof value === 'string' &&
  operatorsAsOptions.some((option) => option.value === value);
