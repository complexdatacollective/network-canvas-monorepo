import { createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';

import type { RelationshipType } from '@codaco/protocol-validation';
import { entityAttributesProperty, type NcEdge } from '@codaco/shared-consts';

import { getCurrentStage } from '../../../selectors/session';

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

const getEdgeConfig = createSelector(getCurrentStage, (stage) => {
  invariant(stage.type === 'FamilyPedigree', 'Stage must be FamilyPedigree');
  return stage.edgeConfig;
});

export const getEdgeTypeKey = createSelector(getEdgeConfig, (c) => c.type);

export const getRelationshipTypeVariable = createSelector(
  getEdgeConfig,
  (c) => c.relationshipTypeVariable,
);
export const getIsActiveVariable = createSelector(
  getEdgeConfig,
  (c) => c.isActiveVariable,
);
export const getIsGestationalCarrierVariable = createSelector(
  getEdgeConfig,
  (c) => c.isGestationalCarrierVariable,
);
export const getGameteRoleVariable = createSelector(
  getEdgeConfig,
  (c) => c.gameteRoleVariable,
);
