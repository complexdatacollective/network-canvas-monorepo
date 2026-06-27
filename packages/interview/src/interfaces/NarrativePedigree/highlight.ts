import type { GeneticGraph } from './genetics/geneticGraph';
import type { Status } from './genetics/status';

/**
 * Returns a stable string key for a directed genetic parent→child edge.
 * Used by the renderer to match highlighted edges against the highlight set.
 */
export function edgeKey(parentId: string, childId: string): string {
  return `${parentId}->${childId}`;
}

/**
 * Returns true when the node has a non-`unknown` status for at least one
 * shown disease.
 */
function hasNonUnknownStatus(
  nodeId: string,
  statusesByDisease: Map<string, Map<string, Status>>,
): boolean {
  for (const diseaseMap of statusesByDisease.values()) {
    const status = diseaseMap.get(nodeId);
    if (status !== undefined && status !== 'unknown') {
      return true;
    }
  }
  return false;
}

/**
 * Computes the focal highlight set for the narrative pedigree.
 *
 * HIGHLIGHT NODES = the focal ids ∪ their genetic-lineage relatives whose
 * status for at least one shown disease is anything other than `unknown`.
 * Focal ids are always included regardless of status.
 *
 * HIGHLIGHT EDGES = the `parentId->childId` edge keys connecting pairs of
 * highlighted nodes that are directly adjacent in the genetic graph.
 *
 * @param focalIds          The set of focal node ids (from the focal resolver).
 * @param graph             The annotated genetic graph.
 * @param statusesByDisease Disease id → (node id → status). A node absent from
 *                          a disease map is treated as `unknown` for that disease.
 */
export function computeHighlight(
  focalIds: Set<string>,
  graph: GeneticGraph,
  statusesByDisease: Map<string, Map<string, Status>>,
): { nodes: Set<string>; edges: Set<string> } {
  // Collect all genetic-lineage relatives of every focal id via BFS.
  // propagate seeds the visited set with the starting ids, so the focal ids
  // themselves are included in `lineage`.
  const lineage = graph.propagate([...focalIds], (id) => [
    ...graph.parentsOf(id).map((p) => p.id),
    ...graph.childrenOf(id),
  ]);

  // Build the highlighted node set: focal ids (always) + relatives with
  // at least one non-unknown status across the shown diseases.
  const nodes = new Set<string>();

  for (const nodeId of lineage) {
    if (
      focalIds.has(nodeId) ||
      hasNonUnknownStatus(nodeId, statusesByDisease)
    ) {
      nodes.add(nodeId);
    }
  }

  // Collect the directed edges that connect two highlighted nodes.
  const edges = new Set<string>();

  for (const nodeId of nodes) {
    for (const childId of graph.childrenOf(nodeId)) {
      if (nodes.has(childId)) {
        edges.add(edgeKey(nodeId, childId));
      }
    }
  }

  return { nodes, edges };
}

/**
 * Computes the contributor highlight set for the narrative pedigree.
 *
 * When focalId is null, the whole pedigree is lit (nothing dimmed).
 * Otherwise, highlights the focal plus every ancestor reachable through
 * a chain of transmitting nodes — walking parents only, and continuing
 * to a parent only when that parent has a non-`unknown` status for at
 * least one disease in statusesByDisease.
 *
 * @param focalId           The focal node id, or null for no dimming.
 * @param graph             The annotated genetic graph.
 * @param statusesByDisease Disease id → (node id → status).
 */
export function computeContributors(
  focalId: string | null,
  graph: GeneticGraph,
  statusesByDisease: Map<string, Map<string, Status>>,
): { nodes: Set<string>; edges: Set<string> } {
  if (focalId === null) {
    const nodes = new Set(graph.nodeIds());
    const edges = new Set<string>();
    for (const id of nodes)
      for (const c of graph.childrenOf(id))
        if (nodes.has(c)) edges.add(edgeKey(id, c));
    return { nodes, edges };
  }

  const nodes = graph.propagate([focalId], (id) =>
    graph
      .parentsOf(id)
      .map((p) => p.id)
      .filter((pid) => hasNonUnknownStatus(pid, statusesByDisease)),
  );

  const edges = new Set<string>();
  for (const id of nodes)
    for (const c of graph.childrenOf(id))
      if (nodes.has(c)) edges.add(edgeKey(id, c));

  return { nodes, edges };
}
