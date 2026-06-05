import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import { PARENT_EDGE_TYPE_OPTIONS_ALTER } from '../quickStartWizard/fieldOptions';

const GENETIC_RELATIONSHIPS = new Set(['biological', 'donor']);

export function countGeneticParents(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): number {
  let count = 0;
  for (const edge of edges.values()) {
    if (edge.to !== nodeId) continue;
    const rel = edge.attributes[variableConfig.relationshipTypeVariable];
    if (typeof rel === 'string' && GENETIC_RELATIONSHIPS.has(rel)) count += 1;
  }
  return count;
}

function hasGestationalCarrier(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): boolean {
  for (const edge of edges.values()) {
    if (
      edge.to === nodeId &&
      edge.attributes[variableConfig.isGestationalCarrierVariable] === true
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Parent-type options that can still be added for a node, given the roles
 * already filled. A person has at most two genetic parents (egg + sperm), so
 * once both genetic slots are filled the genetic types (`biological`/`donor`)
 * are removed; and once a gestational carrier is recorded the `surrogate`
 * option is removed. The remaining (social) options are always available.
 */
export function addableParentTypeOptions(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): typeof PARENT_EDGE_TYPE_OPTIONS_ALTER {
  const bothGametesKnown =
    countGeneticParents(nodeId, edges, variableConfig) >= 2;
  const carrierKnown = hasGestationalCarrier(nodeId, edges, variableConfig);

  return PARENT_EDGE_TYPE_OPTIONS_ALTER.filter((option) => {
    if (
      bothGametesKnown &&
      (option.value === 'biological' || option.value === 'donor')
    ) {
      return false;
    }
    if (carrierKnown && option.value === 'surrogate') {
      return false;
    }
    return true;
  });
}
