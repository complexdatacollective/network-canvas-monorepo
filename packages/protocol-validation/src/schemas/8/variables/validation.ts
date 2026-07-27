import { z } from 'zod';

import { entityAttributeReference } from '../entity-attribute-reference.ts';

export const validations = {
  required: z.boolean().optional(),
  requiredAcceptsNull: z.boolean().optional(),
  minLength: z.number().int().min(0).optional(),

  maxLength: z.number().int().min(1).optional(),
  minValue: z.number().int().optional(),
  maxValue: z.number().int().optional(),
  minSelected: z.number().int().min(0).optional(),
  maxSelected: z.number().int().min(1).optional(),
  unique: z.boolean().optional(),
  differentFrom: entityAttributeReference({
    subject: 'owningVariable',
  }).optional(),
  sameAs: entityAttributeReference({ subject: 'owningVariable' }).optional(),
  greaterThanVariable: entityAttributeReference({
    subject: 'owningVariable',
    requireType: ['number', 'datetime', 'scalar'],
  }).optional(),
  lessThanVariable: entityAttributeReference({
    subject: 'owningVariable',
    requireType: ['number', 'datetime', 'scalar'],
  }).optional(),
  greaterThanOrEqualToVariable: entityAttributeReference({
    subject: 'owningVariable',
    requireType: ['number', 'datetime', 'scalar'],
  }).optional(),
  lessThanOrEqualToVariable: entityAttributeReference({
    subject: 'owningVariable',
    requireType: ['number', 'datetime', 'scalar'],
  }).optional(),
};

export const ValidationsSchema = z.strictObject(validations);

export type Validation = z.infer<typeof ValidationsSchema>;

export type ValidationName = keyof Validation;

/**
 * The validation rules whose value is a reference to another variable's id.
 * Consumers that need to know where a variable can be referenced (cross-reference
 * existence checks, codebook usage detection) must derive from this list so the
 * set stays in sync as rules are added.
 */
export const VARIABLE_REFERENCE_VALIDATIONS = [
  'sameAs',
  'differentFrom',
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
] as const satisfies readonly (keyof typeof validations)[];
