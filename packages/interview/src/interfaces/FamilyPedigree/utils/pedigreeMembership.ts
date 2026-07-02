import type { StageMetadata } from '@codaco/shared-consts';

/**
 * The set of node ids that belong to a pedigree, taken from a FamilyPedigree
 * stage's committed metadata (`nodes`). The interview network is one shared
 * graph, so alters nominated in later stages can share the pedigree's node type;
 * this membership is the authoritative record of who was placed on the pedigree.
 *
 * Returns `null` when the metadata has no committed node list — a not-yet-built
 * pedigree, or a synthetic/seeded network. Callers treat `null` as "membership
 * unknown" and fall back to showing every node of the pedigree's type.
 */
export function pedigreeMemberIds(
  metadata: StageMetadata[string] | undefined,
): Set<string> | null {
  // DyadCensus/TieStrengthCensus metadata is stored as an array; only the
  // FamilyPedigree object form carries a pedigree node list.
  if (!metadata || Array.isArray(metadata)) return null;
  const { nodes } = metadata;
  if (!nodes) return null;
  return new Set(nodes.map((node) => node.id));
}
