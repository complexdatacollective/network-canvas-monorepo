import { createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';

import {
  entityAttributesProperty,
  type NcEdge,
  type RelationshipType,
} from '@codaco/shared-consts';
import { getCurrentStage } from '~/selectors/session';

/**
 * Reads the relationship type from an edge. `relationshipType` is a categorical
 * edge variable, so it is stored as a single-element array of the selected
 * option value; this returns that value (or `undefined` when unset).
 */
export function getEdgeRelationshipType(
  edge: NcEdge,
  relationshipTypeVariable: string,
): RelationshipType | undefined {
  const value = edge[entityAttributesProperty][relationshipTypeVariable];
  return Array.isArray(value)
    ? (value[0] as RelationshipType | undefined)
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
