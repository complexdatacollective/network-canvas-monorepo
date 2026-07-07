import { z } from 'zod';

import { entityAttributeReference } from '~/schemas/8/entity-attribute-reference';
import { entityTypeReference } from '~/schemas/8/entity-type-reference';

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

const filterValueSchema = z
  .union([z.number().int(), z.string(), z.boolean(), z.array(z.any())])
  .optional();

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
