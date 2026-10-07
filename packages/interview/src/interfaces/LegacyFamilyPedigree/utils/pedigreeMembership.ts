import type { NcEdge, StageMetadata } from '@codaco/shared-consts';

// TODO(narrative-pedigree-rebuild): the old Family Pedigree recorded who it
// placed on the pedigree in its stage metadata (`nodes`, `edges`,
// `edgeIdVersion`). The redesigned one does not, so these read that record
// only where an old session holds one, and otherwise report membership as
// unknown.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const committedIds = (
  metadata: unknown,
  key: 'nodes' | 'edges',
): Set<string> | null => {
  if (!isRecord(metadata)) return null;
  const entries = metadata[key];
  if (!Array.isArray(entries)) return null;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (isRecord(entry) && typeof entry.id === 'string') ids.add(entry.id);
  }
  return ids;
};

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
  return committedIds(metadata, 'nodes');
}

/** The edges committed by the pedigree, with the same unknown fallback. */
function pedigreeMemberEdgeIds(
  metadata: StageMetadata[string] | undefined,
): Set<string> | null {
  return committedIds(metadata, 'edges');
}

export type PedigreeEdgeMembership = {
  ids: ReadonlySet<string>;
  idFormat: 'network' | 'legacy';
};

/**
 * The pedigree's committed edge ids together with their persistence format.
 * Versioned snapshots use ids from the shared network. Unversioned snapshots
 * predate that normalization and can contain interface-local ids.
 */
export function pedigreeEdgeMembership(
  metadata: StageMetadata[string] | undefined,
): PedigreeEdgeMembership | null {
  const ids = pedigreeMemberEdgeIds(metadata);
  const record: unknown = metadata;
  if (ids === null || !isRecord(record)) return null;
  return {
    ids,
    idFormat: record.edgeIdVersion === 1 ? 'network' : 'legacy',
  };
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
  edgeMembership: PedigreeEdgeMembership | null,
): NcEdge[] {
  const withinEndpoints = edges.filter(
    (edge) =>
      edge.type === edgeType && nodeIds.has(edge.from) && nodeIds.has(edge.to),
  );
  if (edgeMembership === null) return withinEndpoints;

  const committed = withinEndpoints.filter((edge) =>
    edgeMembership.ids.has(edge._uid),
  );
  // Pedigrees saved before edge ids were normalized can mix Redux ids from the
  // seeded network with Zustand ids from relationships added in the interface.
  // Any missing id therefore makes the whole non-empty list a legacy snapshot;
  // endpoint membership is the only stable ownership record left. Keep an
  // explicitly empty committed list authoritative. Versioned metadata is
  // authoritative even when a later stage deleted one of its committed edges.
  if (
    edgeMembership.idFormat === 'legacy' &&
    edgeMembership.ids.size > 0 &&
    committed.length < edgeMembership.ids.size
  ) {
    return withinEndpoints;
  }
  return committed;
}
