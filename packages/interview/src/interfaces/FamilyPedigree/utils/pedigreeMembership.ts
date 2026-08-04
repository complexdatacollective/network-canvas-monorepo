import {
  isFamilyPedigreeStageMetadata,
  type NcEdge,
  type StageMetadata,
} from '@codaco/shared-consts';

/**
 * The set of node ids that belong to a pedigree, taken from a FamilyPedigree
 * stage's committed metadata (`nodes`). The interview network is one shared
 * graph, so alters nominated in later stages can share the pedigree's node type;
 * this membership is the authoritative record of who was placed on the pedigree.
 *
 * Returns `null` when the metadata has no committed node list — a not-yet-built
 * pedigree or a legacy seeded fixture. Callers treat `null` as "membership
 * unknown" and fall back to showing every node of the pedigree's type.
 */
export function pedigreeMemberIds(
  metadata: StageMetadata[string] | undefined,
): Set<string> | null {
  // The metadata union also covers DyadCensus (tuple array) and NetworkComposer
  // ({ automaticLayout }); only the FamilyPedigree object form carries a node list.
  if (!isFamilyPedigreeStageMetadata(metadata)) return null;
  const { nodes } = metadata;
  if (!nodes) return null;
  return new Set(nodes.map((node) => node.id));
}

/** The edges committed by the pedigree, with the same unknown fallback. */
export function pedigreeMemberEdgeIds(
  metadata: StageMetadata[string] | undefined,
): Set<string> | null {
  if (!isFamilyPedigreeStageMetadata(metadata)) return null;
  const { edges } = metadata;
  if (!edges) return null;
  return new Set(edges.map((edge) => edge.id));
}

/**
 * Restrict the shared network to edges wholly owned by a committed pedigree.
 * Endpoint filtering rejects dangling or foreign relationships even when old
 * metadata has no edge list; a committed edge list additionally excludes later
 * stages that connect two people who already belong to the pedigree.
 */
export function edgesWithinPedigreeMembership(
  edges: readonly NcEdge[],
  edgeType: string,
  nodeIds: ReadonlySet<string>,
  edgeIds: ReadonlySet<string> | null,
): NcEdge[] {
  const withinEndpoints = edges.filter(
    (edge) =>
      edge.type === edgeType && nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  if (edgeIds === null) return withinEndpoints;

  const committed = withinEndpoints.filter((edge) => edgeIds.has(edge._uid));
  // Pedigrees saved before edge ids were normalized retain Zustand store ids in
  // metadata while the shared network contains Redux ids. A non-empty list with
  // no overlap is that legacy shape; endpoint membership is the only stable
  // ownership record left. Keep an explicitly empty committed list authoritative.
  if (edgeIds.size > 0 && committed.length === 0) return withinEndpoints;
  return committed;
}
