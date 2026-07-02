import { z } from 'zod';

const ENTITY_TYPE_REFERENCE = 'entityTypeReference' as const;

// Which codebook the referenced type id lives in. 'filterRule' defers to the
// owning filter rule's `type` field ('node' | 'edge' | 'ego') at collection
// time — ego rules carry no codebook type, so they resolve to no hit.
export type EntityTypeResolution = 'node' | 'edge' | 'filterRule';

export type EntityTypeReferenceDescriptor = {
  entity: EntityTypeResolution;
};

/**
 * A string field holding a codebook node/edge TYPE id. Tagging the schema node
 * (rather than hand-maintaining path lists) lets `collectEntityTypeReferences`
 * discover every type usage in a protocol — the entity-type counterpart of
 * `entityAttributeReference`. Unbranded: subject types flow through far too
 * much runtime code for a brand to be practical.
 */
export const entityTypeReference = (
  descriptor: EntityTypeReferenceDescriptor,
) => z.string().meta({ [ENTITY_TYPE_REFERENCE]: descriptor });

export const getEntityTypeReferenceDescriptor = (
  schema: z.ZodType,
): EntityTypeReferenceDescriptor | undefined => {
  const meta = schema.meta();
  const descriptor = meta?.[ENTITY_TYPE_REFERENCE];
  return descriptor as EntityTypeReferenceDescriptor | undefined;
};
