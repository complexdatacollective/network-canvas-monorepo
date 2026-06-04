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
    const rel = edge.attributes[variableConfig.relationshipTypeVariable] as
      | string
      | undefined;
    if (rel && GENETIC_RELATIONSHIPS.has(rel)) count += 1;
  }
  return count;
}

/**
 * Parent-type options offered when adding a parent. A person has at most two
 * genetic parents (egg + sperm), so once both genetic slots are filled the
 * genetic types (`biological`/`donor`) are removed, leaving non-genetic options.
 */
export function addableParentTypeOptions(geneticParentCount: number) {
  if (geneticParentCount >= 2) {
    return PARENT_EDGE_TYPE_OPTIONS_ALTER.filter(
      (o) => o.value !== 'biological' && o.value !== 'donor',
    );
  }
  return PARENT_EDGE_TYPE_OPTIONS_ALTER;
}
