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

/** Whether the chosen operator needs an operand entered beside it. */
const needsOperand = (operator: unknown): boolean =>
  isFilterOperator(operator) &&
  (operatorsWithValue.has(operator) || operatorsWithOptionCount.has(operator));

/**
 * One part of a rule. The editor asks for each of these with a control of its
 * own.
 *
 * `target` is what the rule is about at all — an entity class, or the ego;
 * `entityType` is the node or edge type an alter rule is pointed at.
 */
export type RulePart =
  | 'target'
  | 'entityType'
  | 'attribute'
  | 'operator'
  | 'value';

/**
 * The first part of this draft that has not been answered, or `undefined` for
 * a rule the protocol schema would accept.
 *
 * Named rather than counted, because a rule that cannot be saved is always one
 * specific unanswered thing: whoever reports it can point at the control that
 * holds the gap instead of saying the rule "is incomplete" and leaving the
 * researcher to find it. The order is the order the editor asks the questions
 * in, so the part named is the highest one on screen.
 *
 * The presence of an `attribute` KEY — not its value — is what tells an
 * attribute rule from a presence rule, in the schema and here alike, so it is
 * tested with `hasOwn` rather than by truthiness. A presence rule never takes
 * an operand: its operators are about the entity itself.
 */
export const incompleteRulePart = (
  rule: RuleDraft | undefined,
): RulePart | undefined => {
  if (rule === undefined) return 'target';
  const options = rule.options ?? {};

  switch (rule.type) {
    case 'node':
    case 'edge': {
      if (!isAnswered(options.type)) return 'entityType';
      if (!Object.hasOwn(options, 'attribute')) {
        return isAnswered(options.operator) ? undefined : 'operator';
      }
      if (!isAnswered(options.attribute)) return 'attribute';
      return missingOperatorOrOperand(options);
    }
    case 'ego': {
      if (!isAnswered(options.attribute)) return 'attribute';
      return missingOperatorOrOperand(options);
    }
    default:
      return 'target';
  }
};

const missingOperatorOrOperand = (
  options: RuleDraftOptions,
): RulePart | undefined => {
  if (!isAnswered(options.operator)) return 'operator';
  return needsOperand(options.operator) && !isAnswered(options.value)
    ? 'value'
    : undefined;
};

/** Whether this draft is a rule the protocol schema would accept. */
export const isCompleteRule = (rule: RuleDraft | undefined): boolean =>
  incompleteRulePart(rule) === undefined;

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
