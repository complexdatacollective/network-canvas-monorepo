import { type NcEdge, type NcNode } from '@codaco/shared-consts';

import {
  isGeneticRelationshipType,
  readGameteRole,
  readRelationshipType,
} from './geneticEdge';

/**
 * Minimal config needed by the genetics engine.
 * Kept narrow so NarrativePedigree stays independent of FamilyPedigree's config types.
 */
export type GeneticGraphConfig = {
  relationshipTypeVariable: string;
  /**
   * When provided, the mtDNA source is inferred from the egg gamete edge — so
   * mitochondrial donation routes mtDNA down the donor's line. When absent, the
   * engine falls back to the female-resolved parent as the mtDNA source
   * (byte-identical to the pre-inference behaviour).
   */
  gameteRoleVariable?: string;
};

type Sex = 'female' | 'male' | 'unknown';

type ParentEdge = {
  parentId: string;
  relType: string;
  gameteRole: string | undefined;
};

function pushInto(
  map: Map<string, string[]>,
  key: string,
  value: string,
): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/**
 * Splits a child's genetic parent edges into the NUCLEAR parents (autosomal /
 * X / Y) and the single mitochondrial (mtDNA) source, applying the
 * egg-cytoplasm rule:
 *
 * - No egg roles recorded → fall back to the sex rule: every genetic parent is
 *   nuclear, and the mtDNA source is the female-resolved parent(s).
 * - One egg → that egg is both the nucleus and the mtDNA source (normal birth
 *   and standard egg donation are unchanged).
 * - Two or more eggs (mitochondrial donation) → the mtDNA egg is the `donor`
 *   egg (the enucleated donor egg retains its cytoplasm), else the first egg;
 *   the nuclear parents are everyone EXCEPT that donor egg.
 *
 * This assumes COHERENT gamete tagging (as produced by Architect / the fixture):
 * an MRT birth tags both eggs `gameteRole='egg'` with the donor egg additionally
 * `relationshipType='donor'`. It does not validate the tagging — malformed input
 * (e.g. two eggs with no `donor` tag, or only the donor egg tagged) would route
 * mtDNA/nuclear parentage by edge order rather than intent. Garbage in, garbage
 * out: the participant UI cannot create a second egg, so coherent tagging is only
 * ever required of Architect-authored or imported networks; there is no
 * schema-level guard (see genetics/MODELLING_DECISIONS.md §3).
 */
function splitParents(
  parentEdges: ParentEdge[],
  resolveSex: (id: string) => Sex,
): { nuclear: string[]; mito: string[] } {
  const allIds = parentEdges.map((p) => p.parentId);
  const eggEdges = parentEdges.filter((p) => p.gameteRole === 'egg');

  const [firstEgg] = eggEdges;
  if (firstEgg === undefined) {
    return {
      nuclear: allIds,
      mito: allIds.filter((id) => resolveSex(id) === 'female'),
    };
  }

  const mitoEgg = eggEdges.find((p) => p.relType === 'donor') ?? firstEgg;
  const nuclear =
    eggEdges.length >= 2
      ? allIds.filter((id) => id !== mitoEgg.parentId)
      : allIds;

  return { nuclear, mito: [mitoEgg.parentId] };
}

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
 * parent(`from`) → child(`to`). The primary (`parentsOf`/`childrenOf`) relation
 * is the NUCLEAR adjacency (autosomal / X / Y); a parallel mitochondrial (mtDNA)
 * relation is exposed via `mitochondrialParentsOf`/`mitochondrialChildrenOf` so
 * mitochondrial donation can route mtDNA independently of the nuclear genome.
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
   * The mitochondrial (mtDNA) parent(s) of `id`: the egg-cytoplasm source.
   * Normally the single female parent; under mitochondrial donation (MRT) it is
   * the donor egg rather than the nuclear/intended mother. Without recorded
   * gamete roles it falls back to the female-resolved parents.
   */
  mitochondrialParentsOf: (id: string) => string[];

  /**
   * The children for whom `id` is the mitochondrial (mtDNA) source — the inverse
   * of `mitochondrialParentsOf`. A male, or the nuclear-only intended mother in
   * an MRT birth, has none.
   */
  mitochondrialChildrenOf: (id: string) => string[];

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
   * Half-siblings of `id` who share at least one FEMALE (maternal) parent with
   * `id` — i.e. those on `id`'s maternal (X / mitochondrial) lineage. A paternal
   * half-sibling (sharing only a male parent) is excluded, as they carry none of
   * the shared mother's X or mtDNA. Excludes `id` itself.
   */
  maternalHalfSiblingsOf: (id: string) => string[];

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
  // Nuclear adjacency (autosomal / X / Y): all genetic parents except a donor
  // egg displaced to mtDNA-only under mitochondrial donation.
  const parentMap = new Map<string, string[]>();
  const childMap = new Map<string, string[]>();
  // Mitochondrial adjacency (egg-cytoplasm): the single mtDNA source per child,
  // or the female-resolved parents when no gamete roles are recorded.
  const mitoParentMap = new Map<string, string[]>();
  const mitoChildMap = new Map<string, string[]>();

  // Initialise every known node with empty arrays to allow lookups on nodes
  // that have no parents/children.
  for (const node of nodes) {
    parentMap.set(node._uid, []);
    childMap.set(node._uid, []);
    mitoParentMap.set(node._uid, []);
    mitoChildMap.set(node._uid, []);
  }

  // First pass: collect each child's genetic parent edges (deduped on
  // parent>child) with their relationship type and gamete role.
  const parentEdgesByChild = new Map<string, ParentEdge[]>();
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

    const gameteRole =
      config.gameteRoleVariable === undefined
        ? undefined
        : readGameteRole(edge, config.gameteRoleVariable);

    const list = parentEdgesByChild.get(childId) ?? [];
    list.push({ parentId, relType, gameteRole });
    parentEdgesByChild.set(childId, list);
  }

  // Second pass: split each child's parents into the nuclear set and the single
  // mtDNA source, then populate both adjacencies in each direction.
  for (const [childId, parentEdges] of parentEdgesByChild) {
    const { nuclear, mito } = splitParents(parentEdges, resolveSex);
    for (const parentId of nuclear) {
      pushInto(parentMap, childId, parentId);
      pushInto(childMap, parentId, childId);
    }
    for (const parentId of mito) {
      pushInto(mitoParentMap, childId, parentId);
      pushInto(mitoChildMap, parentId, childId);
    }
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

  function mitochondrialParentsOf(id: string): string[] {
    return mitoParentMap.get(id) ?? [];
  }

  function mitochondrialChildrenOf(id: string): string[] {
    return mitoChildMap.get(id) ?? [];
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

  function maternalHalfSiblingsOf(id: string): string[] {
    const maternalParentIds = new Set(
      parentsOf(id)
        .filter((parent) => parent.sex === 'female')
        .map((parent) => parent.id),
    );
    if (maternalParentIds.size === 0) {
      return [];
    }
    return halfSiblingsOf(id).filter((sibId) => {
      const theirParentIds = parentMap.get(sibId) ?? [];
      return theirParentIds.some((parentId) => maternalParentIds.has(parentId));
    });
  }

  function nodeIds(): string[] {
    return nodes.map((n) => n._uid);
  }

  return {
    parentsOf,
    childrenOf,
    mitochondrialParentsOf,
    mitochondrialChildrenOf,
    fullSiblingsOf,
    halfSiblingsOf,
    maternalHalfSiblingsOf,
    descendants,
    ancestors,
    propagate,
    nodeIds,
  };
}
