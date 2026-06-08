import type { NcEdge, NcNode } from '@codaco/shared-consts';
import { getNodeLabel } from '~/interfaces/FamilyPedigree/pedigree-layout/utils/getDisplayLabel';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

/** Wizard candidate options: ego as "You", others via the relationship labeller,
 *  filtered to the supplied candidate id set. */
export function buildNodeOptions(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
  candidateIds: Set<string>,
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (const [id, node] of nodes) {
    if (!candidateIds.has(id)) continue;
    if (node.attributes[variableConfig.egoVariable] === true) {
      options.push({ value: id, label: 'You' });
      continue;
    }
    options.push({
      value: id,
      label: getNodeLabel(id, nodes, edges, variableConfig),
    });
  }
  return options;
}
