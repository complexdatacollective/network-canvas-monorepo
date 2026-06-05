import type { NcEdge, NcNode } from '@codaco/shared-consts';

import type { VariableConfig } from '../store';

type ValidationIssue = {
  nodeId: string;
  nodeName: string;
  message: string;
};

// Ego's parents for the structural minimum: any parent-child relationship
// except a step/foster ('social') parent or a partner edge. Adoptive, donor,
// surrogate and biological parents all count toward "you have parents defined".
function getEgoParentIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): string[] {
  const parentIds: string[] = [];
  for (const edge of edges.values()) {
    const relType = edge.attributes[variableConfig.relationshipTypeVariable] as
      | string
      | undefined;
    if (edge.to === nodeId && relType !== 'partner' && relType !== 'social') {
      parentIds.push(edge.from);
    }
  }
  return parentIds;
}

export function validatePedigreeCompleteness(
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const egoEntry = [...nodes.entries()].find(
    ([, node]) => node.attributes[variableConfig.egoVariable] === true,
  );
  if (!egoEntry) return issues;

  const [egoId] = egoEntry;

  // The only hard requirement is that ego has at least two parents. Grandparents
  // (a parent's own parents) are encouraged via the checklist but never required:
  // a parent's ancestry may be genuinely unknown (e.g. a gamete donor) or
  // genetically irrelevant (e.g. an adoptive parent).
  const egoParentIds = getEgoParentIds(egoId, edges, variableConfig);
  if (egoParentIds.length < 2) {
    issues.push({
      nodeId: egoId,
      nodeName: 'You',
      message: 'You must have at least two parents defined.',
    });
  }

  return issues;
}
