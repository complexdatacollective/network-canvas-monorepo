import {
  isFilterOperator,
  operatorsWithOptionCount,
  operatorsWithValue,
} from './operators.ts';

/**
 * A rule as the EDITOR holds it, which is not yet a `FilterRule`.
 *
 * The schema's `FilterRule` describes a rule a protocol may contain: it has an
 * id, a known target and a legal operator. A rule being authored has none of
 * those until the researcher supplies them, and typing a half-built rule as a
 * valid one is exactly the cast the package's session contract forbids. So the
 * draft is its own shape, and `isCompleteRule` is the gate between them.
 *
 * The index signature keeps a draft assignable to fresco-ui's `ArrayField`,
 * whose rows are records; the list's own bookkeeping keys are stripped before
 * a row is read as a rule.
 */
export type RuleDraftOptions = {
  type?: unknown;
  attribute?: unknown;
  operator?: unknown;
  value?: unknown;
  [key: string]: unknown;
};

export type RuleDraft = {
  id?: string;
  type: string;
  options?: RuleDraftOptions;
  [key: string]: unknown;
};

/** An operand the interview runtime can compare. */
export type RuleOperand = string | number | boolean | (string | number)[];

export const isRuleOperand = (value: unknown): value is RuleOperand =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) &&
    value.every(
      (item) => typeof item === 'string' || typeof item === 'number',
    ));

/**
 * Whether a field of a rule has actually been answered.
 *
 * `false` and `0` are answers; an empty string and an empty list are not.
 */
const isAnswered = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value !== '';
  return value !== undefined && value !== null;
};

const areAnswered = (
  keys: readonly string[],
  options: RuleDraftOptions,
): boolean => keys.every((key) => isAnswered(options[key]));

/** Whether the chosen operator needs an operand entered beside it. */
const needsOperand = (operator: unknown): boolean =>
  isFilterOperator(operator) &&
  (operatorsWithValue.has(operator) || operatorsWithOptionCount.has(operator));

/**
 * Whether this draft is a rule the protocol schema would accept.
 *
 * The presence of an `attribute` KEY — not its value — is what tells an
 * attribute rule from a presence rule, in the schema and here alike, so it is
 * tested with `hasOwn` rather than by truthiness.
 */
export const isCompleteRule = (rule: RuleDraft | undefined): boolean => {
  if (rule === undefined) return false;
  const options = rule.options ?? {};

  switch (rule.type) {
    case 'node':
    case 'edge': {
      if (!Object.hasOwn(options, 'attribute')) {
        return areAnswered(['type', 'operator'], options);
      }
      return areAnswered(
        needsOperand(options.operator)
          ? ['type', 'attribute', 'operator', 'value']
          : ['type', 'attribute', 'operator'],
        options,
      );
    }
    case 'ego':
      return areAnswered(
        needsOperand(options.operator)
          ? ['attribute', 'operator', 'value']
          : ['attribute', 'operator'],
        options,
      );
    default:
      return false;
  }
};

export const isRuleDraft = (value: unknown): value is RuleDraft => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return typeof Reflect.get(value, 'type') === 'string';
};

/** The `options` of a draft, as an object, whatever the row actually holds. */
export const ruleDraftOptions = (rule: RuleDraft): RuleDraftOptions => {
  const options = rule.options;
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    return {};
  return options;
};
