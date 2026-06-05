import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  FamilyEdge,
  GameteRole,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

export type ParentRelation = 'child' | 'sibling' | 'define-parents';

/**
 * The gamete role each node has already been nominated for elsewhere in the
 * pedigree (the `from` of a parent edge carrying a `gameteRole`). Used to stop a
 * known egg parent being offered as a sperm parent, and vice versa.
 */
export function nominatedGameteRoles(
  edges: Map<string, FamilyEdge>,
): Map<string, GameteRole> {
  const roles = new Map<string, GameteRole>();
  for (const edge of edges.values()) {
    if (edge.gameteRole === 'egg' || edge.gameteRole === 'sperm') {
      roles.set(edge.from, edge.gameteRole);
    }
  }
  return roles;
}

function relTypeOf(
  edge: NcEdge,
  variableConfig: VariableConfig,
): string | undefined {
  const value = edge.attributes[variableConfig.relationshipTypeVariable];
  return typeof value === 'string' ? value : undefined;
}

/** Children, grandchildren, … reached by following parent->child edges down. */
function descendantIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const edge of edges.values()) {
      if (
        edge.from === current &&
        relTypeOf(edge, variableConfig) !== 'partner' &&
        !result.has(edge.to)
      ) {
        result.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return result;
}

function parentIdsOf(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (edge.to === nodeId && relTypeOf(edge, variableConfig) !== 'partner') {
      result.add(edge.from);
    }
  }
  return result;
}

function partnerIdsOf(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (relTypeOf(edge, variableConfig) !== 'partner') continue;
    if (edge.from === nodeId) result.add(edge.to);
    else if (edge.to === nodeId) result.add(edge.from);
  }
  return result;
}

function donorIds(
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (relTypeOf(edge, variableConfig) === 'donor') result.add(edge.from);
  }
  return result;
}

/**
 * Existing people who can plausibly be the genetic (egg/sperm) parent of the
 * node being added/defined relative to `anchorId`. Donors are always reusable;
 * descendants are never eligible.
 */
export function geneticParentCandidates(
  anchorId: string,
  relation: ParentRelation,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const candidates = new Set<string>();

  if (relation === 'child') {
    candidates.add(anchorId);
    for (const p of partnerIdsOf(anchorId, edges, variableConfig)) {
      candidates.add(p);
    }
  } else {
    const parents = parentIdsOf(anchorId, edges, variableConfig);
    if (relation === 'sibling') {
      for (const p of parents) candidates.add(p);
    }
    for (const parent of parents) {
      for (const pp of partnerIdsOf(parent, edges, variableConfig)) {
        candidates.add(pp);
      }
    }
  }

  for (const d of donorIds(edges, variableConfig)) candidates.add(d);

  for (const d of descendantIds(anchorId, edges, variableConfig)) {
    candidates.delete(d);
  }
  if (relation !== 'child') {
    candidates.delete(anchorId);
    if (relation === 'define-parents') {
      for (const p of parentIdsOf(anchorId, edges, variableConfig)) {
        candidates.delete(p);
      }
      // A node's own partner can never be its (genetic) parent.
      for (const p of partnerIdsOf(anchorId, edges, variableConfig)) {
        candidates.delete(p);
      }
    }
  }

  return candidates;
}

/**
 * Existing people who can be a social/adoptive/surrogate parent of `anchorId`.
 * No genetic-generation constraint — only the node itself, its descendants, its
 * existing parents, and its partners are excluded (a partner can't be a parent).
 */
export function socialParentCandidates(
  anchorId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const excluded = new Set<string>([anchorId]);
  for (const d of descendantIds(anchorId, edges, variableConfig)) {
    excluded.add(d);
  }
  for (const p of parentIdsOf(anchorId, edges, variableConfig)) {
    excluded.add(p);
  }
  for (const p of partnerIdsOf(anchorId, edges, variableConfig)) {
    excluded.add(p);
  }
  const result = new Set<string>();
  for (const id of nodes.keys()) {
    if (!excluded.has(id)) result.add(id);
  }
  return result;
}
