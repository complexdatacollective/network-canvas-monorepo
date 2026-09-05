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
 * A number is not required to be whole. The operators that count SELECTED
 * OPTIONS are, and say so themselves through `FilterOperandKinds` below, but a
 * scalar attribute records a normalised 0-1 reading and a number attribute may
 * hold any quantity the study measures — so an integer-only value could
 * express no scalar comparison at all beyond the two ends of its scale.
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

// Combined filter rule schema using discriminated union
export const filterRuleSchema = z.union([
  attributeLevelFilterRuleSchema,
  typeLevelFilterRuleSchema,
]);

export type FilterRule = z.infer<typeof filterRuleSchema>;

const singleFilterRuleSchema = z.strictObject({
  join: z.enum(['OR', 'AND']).optional(),
  rules: z.array(filterRuleSchema).min(1).max(1),
});

const multipleFilterRuleSchema = z.strictObject({
  join: z.enum(['OR', 'AND']),
  rules: z.array(filterRuleSchema).min(1),
});

export const FilterSchema = z.union([
  singleFilterRuleSchema,
  multipleFilterRuleSchema,
]);

export type Filter = z.infer<typeof FilterSchema>;
