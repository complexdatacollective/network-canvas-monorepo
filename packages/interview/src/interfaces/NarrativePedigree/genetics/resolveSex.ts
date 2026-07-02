import {
  entityAttributesProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { isGeneticRelationshipType, readRelationshipType } from './geneticEdge';

/**
 * Minimal config required by the sex resolver.
 * Kept narrow so this module stays independent of FamilyPedigree's VariableConfig.
 */
export type ResolveSexConfig = {
  biologicalSexVariable: string;
  gameteRoleVariable: string;
  relationshipTypeVariable: string;
};

/**
 * Resolves a person's biological sex for use by the genetics engine.
 *
 * Resolution order (spec §3):
 * 1. Read the node's `biologicalSexVariable` attribute. If exactly `'female'`
 *    or `'male'`, return it. Every other stored value — `'intersex'`,
 *    `'unknown'`, `'preferNotToSay'`, or absent — falls through, so sex-linked
 *    inheritance treats it as uncertainty rather than guessing.
 * 2. Scan outgoing genetic parent edges (edges where `edge.from === nodeId` AND
 *    relType ∈ {biological, donor}) for a `gameteRoleVariable` value:
 *    `'egg'` → `'female'`; `'sperm'` → `'male'`.
 * 3. Return `'unknown'`.
 */
export function resolveSex(
  nodeId: string,
  nodes: NcNode[],
  edges: NcEdge[],
  config: ResolveSexConfig,
): 'female' | 'male' | 'unknown' {
  const node = nodes.find((n) => n._uid === nodeId);

  if (node !== undefined) {
    const sexValue =
      node[entityAttributesProperty][config.biologicalSexVariable];
    if (sexValue === 'female' || sexValue === 'male') {
      return sexValue;
    }
  }

  for (const edge of edges) {
    if (edge.from !== nodeId) {
      continue;
    }

    const relType = readRelationshipType(edge, config.relationshipTypeVariable);
    if (!isGeneticRelationshipType(relType)) {
      continue;
    }

    const gameteRole =
      edge[entityAttributesProperty][config.gameteRoleVariable];
    if (gameteRole === 'egg') {
      return 'female';
    }
    if (gameteRole === 'sperm') {
      return 'male';
    }
  }

  return 'unknown';
}
