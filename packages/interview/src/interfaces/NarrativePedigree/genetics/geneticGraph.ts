import { type NcEdge, type NcNode } from '@codaco/shared-consts';

import { isGeneticRelationshipType, readRelationshipType } from './geneticEdge';

/**
 * Minimal config needed by the genetics engine.
 * Kept narrow so NarrativePedigree stays independent of FamilyPedigree's config types.
 */
export type GeneticGraphConfig = {
  relationshipTypeVariable: string;
};

/**
 * A parent node annotated with the resolved biological sex of that parent.
 */
export type AnnotatedParent = {
  id: string;
  sex: 'female' | 'male' | 'unknown';
};

/**
 * The annotated genetic graph produced by `buildGeneticGraph`.
 *
 * Adjacency is built from `biological`|`donor` edges only, directed
 * parent(`from`) → child(`to`).
 */
export type GeneticGraph = {
  /**
   * Genetic parents of `id`, each annotated with the parent's resolved sex.
   */
  parentsOf: (id: string) => AnnotatedParent[];

  /**
   * Direct genetic children of `id`.
   */
  childrenOf: (id: string) => string[];

  /**
   * Individuals who share BOTH of `id`'s genetic parents (same two-parent
   * set). Excludes `id` itself.
   */
  fullSiblingsOf: (id: string) => string[];

  /**
   * Individuals who share AT LEAST ONE genetic parent with `id` but are NOT
   * full siblings. Full siblings are excluded first, then any remaining
   * candidate who shares at least one parent is classified as a half-sibling.
   * Excludes `id` itself.
   */
  halfSiblingsOf: (id: string) => string[];

  /**
   * Transitive closure of all genetic descendants of `id` (BFS).
   */
  descendants: (id: string) => Set<string>;

  /**
   * Transitive closure of all genetic ancestors of `id` (BFS).
   */
  ancestors: (id: string) => Set<string>;

  /**
   * Generic BFS that applies `step(currentId) => nextIds` from each seed
   * until exhaustion. An explicit visited-set ensures consanguinity loops
   * terminate and no node is processed twice.
   *
   * @param seedIds  Starting node ids.
   * @param step     Function returning the next ids to visit from a given id.
   * @param visited  Optional pre-seeded visited set (mutated in-place and returned).
   */
  propagate: (
    seedIds: string[],
    step: (id: string) => string[],
    visited?: Set<string>,
  ) => Set<string>;

  /**
   * All node ids known to this graph (every node passed to `buildGeneticGraph`).
   */
  nodeIds: () => string[];
};

/**
 * Builds an annotated genetic graph from the shared interview network.
 *
 * @param nodes       All network nodes.
 * @param edges       All network edges.
 * @param config      Genetics engine config (at minimum: `relationshipTypeVariable`).
 * @param resolveSex  Injected sex resolver (Task 4). Receives a node id and
 *                    returns its resolved biological sex.
 */
export function buildGeneticGraph(
  nodes: NcNode[],
  edges: NcEdge[],
  config: GeneticGraphConfig,
  resolveSex: (nodeId: string) => 'female' | 'male' | 'unknown',
): GeneticGraph {
  // parentMap[childId] = [parentId, ...]
  const parentMap = new Map<string, string[]>();
  // childMap[parentId] = [childId, ...]
  const childMap = new Map<string, string[]>();

  // Initialise every known node with empty arrays to allow lookups on nodes
  // that have no parents/children.
  for (const node of nodes) {
    parentMap.set(node._uid, []);
    childMap.set(node._uid, []);
  }

  const seenGeneticEdges = new Set<string>();

  for (const edge of edges) {
    const relType = readRelationshipType(edge, config.relationshipTypeVariable);
    if (!isGeneticRelationshipType(relType)) {
      continue;
    }

    const parentId = edge.from;
    const childId = edge.to;

    const edgeKey = `${parentId}>${childId}`;
    if (seenGeneticEdges.has(edgeKey)) {
      continue;
    }
    seenGeneticEdges.add(edgeKey);

    const parentList = parentMap.get(childId) ?? [];
    parentList.push(parentId);
    parentMap.set(childId, parentList);

    const childList = childMap.get(parentId) ?? [];
    childList.push(childId);
    childMap.set(parentId, childList);
  }

  function parentsOf(id: string): AnnotatedParent[] {
    const ids = parentMap.get(id) ?? [];
    return ids.map((parentId) => ({
      id: parentId,
      sex: resolveSex(parentId),
    }));
  }

  function childrenOf(id: string): string[] {
    return childMap.get(id) ?? [];
  }

  function propagate(
    seedIds: string[],
    step: (id: string) => string[],
    visited: Set<string> = new Set<string>(),
  ): Set<string> {
    const queue = [...seedIds];

    for (const seed of seedIds) {
      visited.add(seed);
    }

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }
      const nexts = step(current);
      for (const next of nexts) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    return visited;
  }

  function descendants(id: string): Set<string> {
    const visited = new Set<string>();
    propagate([id], childrenOf, visited);
    // Exclude the starting node itself from the result
    visited.delete(id);
    return visited;
  }

  function ancestors(id: string): Set<string> {
    const visited = new Set<string>();
    propagate([id], (nodeId) => parentsOf(nodeId).map((p) => p.id), visited);
    visited.delete(id);
    return visited;
  }

  function fullSiblingsOf(id: string): string[] {
    const myParentIds = parentMap.get(id) ?? [];
    if (myParentIds.length === 0) {
      return [];
    }

    // Sort for stable set comparison
    const myParentSet = new Set(myParentIds);

    // Collect all candidates: children of any of my parents, excluding self
    const candidates = new Set<string>();
    for (const parentId of myParentIds) {
      for (const sibId of childrenOf(parentId)) {
        if (sibId !== id) {
          candidates.add(sibId);
        }
      }
    }

    const result: string[] = [];
    for (const candidateId of candidates) {
      const theirParentIds = parentMap.get(candidateId) ?? [];
      if (theirParentIds.length !== myParentIds.length) {
        continue;
      }
      const theirParentSet = new Set(theirParentIds);
      const sameParents =
        theirParentIds.every((p) => myParentSet.has(p)) &&
        myParentIds.every((p) => theirParentSet.has(p));
      if (sameParents) {
        result.push(candidateId);
      }
    }

    return result;
  }

  function halfSiblingsOf(id: string): string[] {
    const myParentIds = parentMap.get(id) ?? [];
    if (myParentIds.length === 0) {
      return [];
    }

    const myParentSet = new Set(myParentIds);
    const fullSibSet = new Set(fullSiblingsOf(id));

    const candidates = new Set<string>();
    for (const parentId of myParentIds) {
      for (const sibId of childrenOf(parentId)) {
        if (sibId !== id && !fullSibSet.has(sibId)) {
          candidates.add(sibId);
        }
      }
    }

    const result: string[] = [];
    for (const candidateId of candidates) {
      const theirParentIds = parentMap.get(candidateId) ?? [];
      const sharedCount = theirParentIds.filter((p) =>
        myParentSet.has(p),
      ).length;
      if (sharedCount >= 1) {
        result.push(candidateId);
      }
    }

    return result;
  }

  function nodeIds(): string[] {
    return nodes.map((n) => n._uid);
  }

  return {
    parentsOf,
    childrenOf,
    fullSiblingsOf,
    halfSiblingsOf,
    descendants,
    ancestors,
    propagate,
    nodeIds,
  };
}
