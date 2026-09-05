import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';
import { entityTypeReference } from '../entity-type-reference.ts';

// Operators valid when checking entity type existence (no attribute specified)
export const TypeLevelOperators = z.enum(['EXISTS', 'NOT_EXISTS']);

// All operators (attribute-level validation happens in logic validation based on variable type)
export const AllOperators = z.enum([
  'EXISTS',
  'NOT_EXISTS',
  'EXACTLY',
  'NOT',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'INCLUDES',
  'EXCLUDES',
  'OPTIONS_GREATER_THAN',
  'OPTIONS_LESS_THAN',
  'OPTIONS_EQUALS',
  'OPTIONS_NOT_EQUALS',
  'CONTAINS',
  'DOES_NOT_CONTAIN',
]);

export type FilterOperator = z.infer<typeof AllOperators>;

// Operator sets by variable type (used in logic validation)
export const BaseOperators = [
  'EXISTS',
  'NOT_EXISTS',
  'EXACTLY',
  'NOT',
] as const;
export const TextOperators = [
  ...BaseOperators,
  'CONTAINS',
  'DOES_NOT_CONTAIN',
] as const;
export const NumericOperators = [
  ...BaseOperators,
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
] as const;
export const CategoricalOperators = [
  ...BaseOperators,
  'INCLUDES',
  'EXCLUDES',
  'OPTIONS_GREATER_THAN',
  'OPTIONS_LESS_THAN',
  'OPTIONS_EQUALS',
  'OPTIONS_NOT_EQUALS',
] as const;
export const OrdinalOperators = [
  ...BaseOperators,
  'INCLUDES',
  'EXCLUDES',
] as const;

// Map variable types to their valid operators
export const OperatorsByVariableType: Record<string, readonly string[]> = {
  boolean: BaseOperators,
  text: TextOperators,
  number: NumericOperators,
  scalar: NumericOperators,
  datetime: NumericOperators,
  ordinal: OrdinalOperators,
  categorical: CategoricalOperators,
  layout: BaseOperators,
  location: BaseOperators,
};

/**
 * What a rule's comparison value may be, whatever it is being compared
 * against.
 *
 * This is the widest a value may be, and deliberately the whole of what can be
 * said WITHOUT the operator: which of these shapes a given comparison actually
 * accepts is decided by `FilterOperandKinds` below and applied by
 * `filterRuleSchema`, where both halves of the comparison are in hand.
 *
 * A number is not required to be whole here. The operators that count SELECTED
 * OPTIONS are, and say so through their operand kind, but a scalar attribute
 * records a normalised 0-1 reading and a number attribute may hold any
 * quantity the study measures — so an integer-only value could express no
 * scalar comparison at all beyond the two ends of its scale.
 *
 * Exported because it is the only statement of what a rule may hold at
 * `value`, and the protocol builder chooses each operand's control from it
 * rather than from a second list of its own that could drift.
 */
export const filterValueSchema = z
  .union([z.number(), z.string(), z.boolean(), z.array(z.any())])
  .optional();

/**
 * What kind of value each operator compares against.
 *
 * - `none` — the operator asks only whether something is there, so a value
 *   beside it is not part of the comparison.
 * - `number` / `integer` — the operator resolves both sides to a point on a
 *   scale, or counts selected options, so the value has to be one.
 * - `string` — the operator reads the value as a regular expression.
 * - `attribute` — the operator compares the value against the ANSWER, so what
 *   shape it must have is decided by the attribute's own type rather than by
 *   the operator. `INCLUDES`/`EXCLUDES` are here too: they accept one option
 *   or a list of them, and resolve the difference at runtime.
 *
 * One table, read by this package's own logic validation and by the protocol
 * builder's operand controls, so the control a researcher is given and the
 * value the validator will accept cannot disagree.
 */
export type FilterOperandKind =
  | 'none'
  | 'number'
  | 'integer'
  | 'string'
  | 'attribute';

export const FilterOperandKinds: Readonly<
  Record<FilterOperator, FilterOperandKind>
> = Object.freeze({
  EXISTS: 'none',
  NOT_EXISTS: 'none',
  EXACTLY: 'attribute',
  NOT: 'attribute',
  INCLUDES: 'attribute',
  EXCLUDES: 'attribute',
  GREATER_THAN: 'number',
  GREATER_THAN_OR_EQUAL: 'number',
  LESS_THAN: 'number',
  LESS_THAN_OR_EQUAL: 'number',
  OPTIONS_GREATER_THAN: 'integer',
  OPTIONS_LESS_THAN: 'integer',
  OPTIONS_EQUALS: 'integer',
  OPTIONS_NOT_EQUALS: 'integer',
  CONTAINS: 'string',
  DOES_NOT_CONTAIN: 'string',
});

// Options schema for type-level rules (no attribute - checking entity existence)
const typeLevelOptionsSchema = z.strictObject({
  // The codebook type being tested; which codebook comes from the owning
  // rule's `type` field ('node' | 'edge'), resolved at collection time.
  type: entityTypeReference({ entity: 'filterRule' }).optional(),
  operator: TypeLevelOperators,
  value: filterValueSchema,
});

// Options schema for attribute-level rules (attribute specified - checking variable value)
const attributeLevelOptionsSchema = z.strictObject({
  type: entityTypeReference({ entity: 'filterRule' }).optional(),
  attribute: entityAttributeReference({ subject: 'filterRule' }),
  operator: AllOperators,
  value: filterValueSchema,
});

// Type-level filter rule (no attribute - EXISTS/NOT_EXISTS only)
const typeLevelFilterRuleSchema = z.strictObject({
  type: z.enum(['node', 'ego', 'edge']),
  id: z.string(),
  options: typeLevelOptionsSchema,
});

// Attribute-level filter rule (attribute specified - all operators valid at schema level)
const attributeLevelFilterRuleSchema = z.strictObject({
  type: z.enum(['node', 'ego', 'edge']),
  id: z.string(),
  options: attributeLevelOptionsSchema,
});

/**
 * What each operand kind has to BE, as a schema of its own.
 *
 * One entry per member of `FilterOperandKind`, so the constraint a kind
 * carries is stated beside the table that assigns it rather than reconstructed
 * by whoever reads the table next. `integer` is `z.number().int()` because
 * there is no such thing as one and a half selected options: a fractional
 * count is a rule that can never be satisfied exactly, and reads as nonsense
 * in the summary.
 *
 * `none` and `attribute` ask nothing. The first belongs to an operator that
 * compares no value at all; the second leaves the shape to the ATTRIBUTE's own
 * type, which the rule schema cannot see — and deliberately does not ask about
 * option MEMBERSHIP either (ruling on issue #1548: a protocol already in the
 * field holds rules naming an option a collaborator has since renamed, and
 * refusing to load one would lock the researcher out of the editor that could
 * fix it).
 */
const OPERAND_SCHEMAS: Readonly<Record<FilterOperandKind, z.ZodType>> =
  Object.freeze({
    none: z.unknown(),
    number: z.number(),
    integer: z.number().int(),
    string: z.string(),
    attribute: z.unknown(),
  });

const operandTypeName = (value: unknown): string =>
  Array.isArray(value) ? 'array' : typeof value;

/** Why this operand is refused, in the terms the operator itself sets. */
const operandMessage = (
  operator: FilterOperator,
  kind: FilterOperandKind,
  value: unknown,
): string => {
  if (kind === 'integer') {
    return typeof value === 'number'
      ? `Operator "${operator}" requires a whole number of options, but got ${String(value)}`
      : `Operator "${operator}" requires a numeric value (count), but got ${operandTypeName(value)}`;
  }
  if (kind === 'string') {
    return `Operator "${operator}" requires a string value, but got ${operandTypeName(value)}`;
  }
  // `number` is the only kind left that refuses anything: `none` and
  // `attribute` accept every value the schema can hold, so no operand of
  // theirs ever needs a reason.
  return `Operator "${operator}" requires a numeric value, but got ${operandTypeName(value)}`;
};

/**
 * Every filter rule, with its operand held to what its operator compares.
 *
 * The refinement sits on the union rather than inside either member so that a
 * rule is CLASSIFIED first and judged second: an operand of the wrong kind is
 * then reported as the specific thing that is wrong with it, on the value
 * itself, rather than as a union that matched neither shape.
 *
 * Stated here rather than in the protocol schema's own cross-reference pass
 * because these exports are the package's public statement of what a filter
 * is: a host validating a bare filter through `FilterSchema` gets the same
 * verdict as one validating the whole protocol, instead of a false pass on a
 * count the interview can never satisfy exactly.
 */
export const filterRuleSchema = z
  .union([attributeLevelFilterRuleSchema, typeLevelFilterRuleSchema])
  .superRefine((rule, ctx) => {
    const value: unknown = rule.options.value;
    // An operand that is not there is an unfinished rule, not a wrong one, and
    // the schema leaves `value` optional for the operators that need none.
    if (value === undefined) return;

    const operator: FilterOperator = rule.options.operator;
    const kind = FilterOperandKinds[operator];
    if (OPERAND_SCHEMAS[kind].safeParse(value).success) return;

    ctx.addIssue({
      code: 'custom',
      message: operandMessage(operator, kind, value),
      path: ['options', 'value'],
      input: value,
    });
  });

export type FilterRule = z.infer<typeof filterRuleSchema>;

/**
 * A filter: the rules, and how they combine.
 *
 * One shape with a condition on it rather than two shapes to choose between.
 * A union of "one rule, join optional" and "several rules, join required"
 * accepted exactly the same protocols, but reported a rule that broke BOTH
 * shapes as `invalid_union` — one "Invalid input" against the whole filter,
 * with the reason the rule was refused discarded. That is the only report a
 * researcher gets for an operand of the wrong kind, so the shape is stated
 * once and the one thing that varies between the two is asked as a check.
 */
export const FilterSchema = z
  .strictObject({
    join: z.enum(['OR', 'AND']).optional(),
    rules: z.array(filterRuleSchema).min(1),
  })
  .superRefine((filter, ctx) => {
    // A lone rule needs no join: there is nothing for it to combine with.
    if (filter.rules.length <= 1 || filter.join !== undefined) return;
    ctx.addIssue({
      code: 'custom',
      message:
        'A filter with more than one rule must say how they combine, with a join of "AND" or "OR".',
      path: ['join'],
      input: filter.join,
    });
  });

export type Filter = z.infer<typeof FilterSchema>;
