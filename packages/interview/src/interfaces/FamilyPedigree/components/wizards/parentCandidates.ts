import type { NcEdge, NcNode, RelationshipType } from '@codaco/shared-consts';
import type {
  FamilyEdge,
  GameteRole,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';
import { getEdgeRelationshipType } from '~/interfaces/FamilyPedigree/utils/edgeUtils';

function readGameteRole(value: unknown): GameteRole | undefined {
  return value === 'egg' || value === 'sperm' ? value : undefined;
}

export type ParentRelation = 'child' | 'sibling' | 'define-parents';

/**
 * The gamete role each node has already been nominated for elsewhere in the
 * pedigree, read from the edge attribute stored under `gameteRoleVariable`.
 * Used to stop a known egg parent being offered as a sperm parent, and vice versa.
 */
export function nominatedGameteRoles(
  edges: Map<string, FamilyEdge>,
  variableConfig: VariableConfig,
): Map<string, GameteRole> {
  const roles = new Map<string, GameteRole>();
  for (const edge of edges.values()) {
    const role = readGameteRole(
      edge.attributes[variableConfig.gameteRoleVariable],
    );
    if (role) {
      roles.set(edge.from, role);
    }
  }
  return roles;
}

function relTypeOf(
  edge: NcEdge,
  variableConfig: VariableConfig,
): RelationshipType | undefined {
  return getEdgeRelationshipType(edge, variableConfig.relationshipTypeVariable);
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

/** Full or half siblings: other children of the node's parents. */
function siblingIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const parents = parentIdsOf(nodeId, edges, variableConfig);
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (relTypeOf(edge, variableConfig) === 'partner') continue;
    if (parents.has(edge.from) && edge.to !== nodeId) {
      result.add(edge.to);
    }
  }
  return result;
}

/** Direct children of nodeId (non-partner edges where nodeId is the source). */
function childIdsOf(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const result = new Set<string>();
  for (const edge of edges.values()) {
    if (edge.from === nodeId && relTypeOf(edge, variableConfig) !== 'partner') {
      result.add(edge.to);
    }
  }
  return result;
}

/** Siblings sharing BOTH parents with nodeId (excludes half-siblings). */
function fullSiblingIds(
  nodeId: string,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const parents = parentIdsOf(nodeId, edges, variableConfig);
  if (parents.size === 0) return new Set();
  const parentArray = [...parents];
  const childSets = parentArray.map((p) =>
    childIdsOf(p, edges, variableConfig),
  );
  const result = new Set<string>();
  for (const candidate of childSets[0] ?? new Set<string>()) {
    if (candidate === nodeId) continue;
    if (childSets.every((s) => s.has(candidate))) result.add(candidate);
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
    // A sibling is the same generation as the anchor, so they can be a gamete
    // donor for the anchor's child (e.g. a sister donating an egg combined with
    // the partner's sperm — a standard ART scenario, not consanguineous).
    for (const s of siblingIds(anchorId, edges, variableConfig)) {
      candidates.add(s);
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

/**
 * People eligible to be partnered with `anchorId`: everyone except the node
 * itself and its first-degree relatives (parents, children, full siblings).
 * Second-degree+ relatives (cousins, half-sibs, uncle/niece, grandparents) are
 * eligible — this is what makes consanguineous unions capturable.
 */
export function partnerCandidates(
  anchorId: string,
  nodes: Map<string, NcNode>,
  edges: Map<string, NcEdge>,
  variableConfig: VariableConfig,
): Set<string> {
  const excluded = new Set<string>([anchorId]);
  for (const p of parentIdsOf(anchorId, edges, variableConfig)) excluded.add(p);
  for (const c of childIdsOf(anchorId, edges, variableConfig)) excluded.add(c);
  for (const s of fullSiblingIds(anchorId, edges, variableConfig))
    excluded.add(s);
  const result = new Set<string>();
  for (const id of nodes.keys()) if (!excluded.has(id)) result.add(id);
  return result;
}
