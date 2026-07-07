import type { NcEdge } from '@codaco/shared-consts';

import { getEdgeRelationshipType } from '../utils/edgeUtils';

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
};

/**
 * An optional checklist nudge to record up to two parents for `targetId`.
 * `idPrefix` namespaces the item id (e.g. "grandparents", "partner-parents").
 */
export function buildParentsItem(
  targetId: string,
  targetName: string,
  idPrefix: string,
  edges: Map<string, NcEdge>,
  relationshipTypeVariable: string,
  manuallyChecked: Set<string>,
): ChecklistItem {
  let parentCount = 0;
  for (const edge of edges.values()) {
    const rt = getEdgeRelationshipType(edge, relationshipTypeVariable);
    if (edge.to === targetId && rt !== 'partner' && rt !== 'social') {
      parentCount += 1;
    }
  }
  const id = `${idPrefix}-${targetId}`;
  const done = parentCount >= 2 || manuallyChecked.has(id);
  const remaining = Math.max(0, 2 - parentCount);
  return {
    id,
    label:
      !done && remaining === 1
        ? `Add 1 more parent for ${targetName}`
        : `Add parents for ${targetName}`,
    done,
    required: false,
  };
}

/**
 * Ego's partners who are a genetic (biological/donor) parent of one of ego's
 * children — i.e. the partnership produced offspring, so the partner's own
 * parents become relevant to those children's family history.
 */
export function partnersNeedingParents(
  egoId: string,
  edges: Map<string, NcEdge>,
  relationshipTypeVariable: string,
): string[] {
  const egoChildIds = new Set<string>();
  const partnerIds = new Set<string>();
  for (const edge of edges.values()) {
    const rt = getEdgeRelationshipType(edge, relationshipTypeVariable);
    if (edge.from === egoId && rt !== 'partner') egoChildIds.add(edge.to);
    if (rt === 'partner') {
      if (edge.from === egoId) partnerIds.add(edge.to);
      else if (edge.to === egoId) partnerIds.add(edge.from);
    }
  }

  const result: string[] = [];
  for (const partnerId of partnerIds) {
    for (const edge of edges.values()) {
      const rt = getEdgeRelationshipType(edge, relationshipTypeVariable);
      if (
        edge.from === partnerId &&
        egoChildIds.has(edge.to) &&
        (rt === 'biological' || rt === 'donor')
      ) {
        result.push(partnerId);
        break;
      }
    }
  }
  return result;
}
