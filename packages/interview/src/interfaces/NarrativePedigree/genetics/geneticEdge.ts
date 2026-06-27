import { entityAttributesProperty, type NcEdge } from '@codaco/shared-consts';

const GENETIC_RELATIONSHIP_TYPES = ['biological', 'donor'] as const;
type GeneticRelationshipType = (typeof GENETIC_RELATIONSHIP_TYPES)[number];

export function isGeneticRelationshipType(
  value: unknown,
): value is GeneticRelationshipType {
  return value === 'biological' || value === 'donor';
}

/**
 * Reads the relationship type from an edge attribute.
 * The categorical variable is stored as a single-element array; this handles
 * both the array form and (defensively) a plain string.
 */
export function readRelationshipType(
  edge: NcEdge,
  relationshipTypeVariable: string,
): string | undefined {
  const raw = edge[entityAttributesProperty][relationshipTypeVariable];
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof raw === 'string' ? raw : undefined;
}
