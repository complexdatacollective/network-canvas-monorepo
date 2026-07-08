import { entityAttributesProperty, type NcEdge } from '@codaco/shared-consts';

const GENETIC_RELATIONSHIP_TYPES = ['biological', 'donor'] as const;
type GeneticRelationshipType = (typeof GENETIC_RELATIONSHIP_TYPES)[number];

export function isGeneticRelationshipType(
  value: unknown,
): value is GeneticRelationshipType {
  return value === 'biological' || value === 'donor';
}

/**
 * Reads a categorical edge attribute. The categorical variable is stored as a
 * single-element array; this handles both the array form and (defensively) a
 * plain string, returning the value or `undefined`.
 */
function readCategoricalEdgeAttribute(
  edge: NcEdge,
  variable: string,
): string | undefined {
  const raw = edge[entityAttributesProperty][variable];
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === 'string' ? first : undefined;
  }
  return typeof raw === 'string' ? raw : undefined;
}

/** Reads the relationship type (`biological`/`donor`/…) from an edge. */
export function readRelationshipType(
  edge: NcEdge,
  relationshipTypeVariable: string,
): string | undefined {
  return readCategoricalEdgeAttribute(edge, relationshipTypeVariable);
}

/**
 * Reads the gamete role (`egg`/`sperm`) from an edge. Returns `undefined` when
 * the variable is unset — the caller then falls back to the sex-derived mtDNA
 * rule.
 */
export function readGameteRole(
  edge: NcEdge,
  gameteRoleVariable: string,
): string | undefined {
  return readCategoricalEdgeAttribute(edge, gameteRoleVariable);
}
