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

export type EntityAttributeReferenceDescriptor = {
  subject: SubjectResolution;
  requireType?: readonly VariableType[];
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
