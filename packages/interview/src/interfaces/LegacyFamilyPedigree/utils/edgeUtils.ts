import { entityAttributesProperty, type NcEdge } from '@codaco/shared-consts';

import type { RelationshipType } from '../legacyValues';

/**
 * Reads the relationship type from an edge. Categorical variables store the
 * selected option in a single-element array, while ordinal variables store the
 * selected value directly. FamilyPedigree accepts either variable type, so its
 * readers must accept both storage shapes.
 */
export function getEdgeRelationshipType(
  edge: NcEdge,
  relationshipTypeVariable: string,
): RelationshipType | undefined {
  const value = edge[entityAttributesProperty][relationshipTypeVariable];
  const relationshipType = Array.isArray(value) ? value[0] : value;
  return typeof relationshipType === 'string'
    ? (relationshipType as RelationshipType)
    : undefined;
}
