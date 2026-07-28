import { z } from 'zod';

import type { VariableType } from './variables/types.ts';

export const ENTITY_ATTRIBUTE_REFERENCE = 'entityAttributeReference' as const;

export type SubjectResolution =
  | 'stageSubject'
  | 'ego'
  | 'owningVariable'
  // Extracted for usage detection but existence-checked by the dedicated
  // filter-rule validation (rule-scoped subject), not the entity-attribute
  // validator.
  | 'filterRule'
  | { sibling: string; entity: 'node' | 'edge' };

export type AttributeWriterUsage =
  | 'validatedAttribute'
  | 'unvalidatedAttribute';

export type EntityAttributeReferenceDescriptor = {
  subject: SubjectResolution;
  requireType?: readonly VariableType[];
  /**
   * How the interview writes through this reference: via the form system
   * (codebook validation applies) or via a direct dispatch (it does not).
   * Absent on read-only references. Static schema metadata — never stored in
   * protocols; the collector's hits inherit it from the matching site.
   */
  usage?: AttributeWriterUsage;
};

export const entityAttributeReference = (
  descriptor: EntityAttributeReferenceDescriptor,
) =>
  z
    .string()
    .brand<'EntityAttributeReference'>()
    .meta({ [ENTITY_ATTRIBUTE_REFERENCE]: descriptor });

export type EntityAttributeReference = z.infer<
  ReturnType<typeof entityAttributeReference>
>;

export const asEntityAttributeReference = (
  id: string,
): EntityAttributeReference => id as EntityAttributeReference;

export const getEntityAttributeReferenceDescriptor = (
  schema: z.ZodType,
): EntityAttributeReferenceDescriptor | undefined => {
  const meta = schema.meta();
  const descriptor = meta?.[ENTITY_ATTRIBUTE_REFERENCE];
  return descriptor as EntityAttributeReferenceDescriptor | undefined;
};
