import type { InheritancePattern } from '@codaco/shared-consts';

import type { AnnotatedParent, GeneticGraph } from './genetics/geneticGraph';
import type { Status } from './genetics/status';

type Sex = 'female' | 'male' | 'unknown';

/**
 * Returns a stable string key for a directed genetic parent→child edge.
 * Used by the renderer to match highlighted edges against the highlight set.
 */
export function edgeKey(parentId: string, childId: string): string {
  return `${parentId}->${childId}`;
}

/**
 * One shown disease's computed statuses plus its inheritance pattern, so the
 * focal contributor walk can apply that pattern's transmission rules.
 */
export type DiseaseContributors = {
  pattern: InheritancePattern;
  statuses: Map<string, Status>;
};

/** A node is on a disease's lineage when it has any non-`unknown` status. */
function isOnLineage(status: Status | undefined): boolean {
  return status !== undefined && status !== 'unknown';
}

// A hemizygous affected male transmits his single disease X to EVERY daughter,
// and a homozygous affected female to EVERY child — both are CERTAIN disease-X
// transmitters. (`obligateAffected` is the inferred-affected form of either.) A
// merely-carrier parent (obligateCarrier/atRisk*) transmits the disease X with
// only ~50% probability, so is never a certain source.
const CERTAIN_X_TRANSMITTER_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'affected',
  'obligateAffected',
]);

/**
 * The genetic parents of `childId` who could have transmitted this disease's
 * allele to it under the disease's inheritance pattern AND are themselves on the
 * disease lineage (non-`unknown` status). This is the per-pattern transmission
 * filter that keeps the focal contributor walk on the true source line rather
 * than lighting every relative who merely carries an inferred prior:
 *
 * - Autosomal (dominant/recessive), multifactorial, unknown: an autosome passes
 *   from either parent — every on-lineage parent qualifies.
 * - Y-linked: father→son only. A son's Y came from his father; a daughter
 *   receives no Y, so for a non-male child NO parent qualifies.
 * - Mitochondrial: mother→all children — the on-lineage FEMALE parent.
 * - X-linked (recessive/dominant):
 *   - a MALE child's single X came from his mother — the on-lineage FEMALE
 *     parent only (his father gave him the Y, not an X);
 *   - under X-linked RECESSIVE a heterozygous carrier daughter of an affected
 *     father took her single disease X from him with certainty, so the maternal
 *     line is excluded — UNLESS she is herself homozygous-affected (status
 *     `affected`) or a parent is itself a CERTAIN disease-X transmitter (an
 *     affected/obligate-affected mother), in which case both lines are genuine
 *     sources. This is what drops an incidental maternal-line carrier (e.g. a
 *     maternal grandmother flagged only as an at-risk prior) while keeping a
 *     truly transmitting mother;
 *   - under X-linked DOMINANT one affected X suffices, so an affected father
 *     never excludes an affected/transmitting mother — every on-lineage parent
 *     qualifies for a daughter;
 *   - a child of UNKNOWN sex: the X rule cannot be applied, so fall back to every
 *     on-lineage parent (over-inclusive rather than wrongly dropping the source).
 */
function transmittingParents(
  pattern: InheritancePattern,
  childId: string,
  childSex: Sex,
  parents: AnnotatedParent[],
  statuses: Map<string, Status>,
): string[] {
  const onLineage = parents.filter((p) => isOnLineage(statuses.get(p.id)));

  switch (pattern) {
    case 'autosomalDominant':
    case 'autosomalRecessive':
    case 'multifactorial':
    case 'unknown':
      return onLineage.map((p) => p.id);

    case 'yLinked':
      // The Y passes father→son only; a non-male child received no Y from anyone.
      return childSex === 'male'
        ? onLineage.filter((p) => p.sex === 'male').map((p) => p.id)
        : [];

    case 'mitochondrial':
      return onLineage.filter((p) => p.sex === 'female').map((p) => p.id);

    case 'xLinkedRecessive':
    case 'xLinkedDominant': {
      if (childSex === 'male') {
        // The son's single X came from his mother; his father gave the Y.
        return onLineage.filter((p) => p.sex === 'female').map((p) => p.id);
      }
      if (childSex === 'female' && pattern === 'xLinkedRecessive') {
        const affectedFathers = onLineage.filter(
          (p) =>
            p.sex === 'male' &&
            CERTAIN_X_TRANSMITTER_STATUSES.has(statuses.get(p.id) ?? 'unknown'),
        );
        // The paternal X is the daughter's sole source ONLY when she is a simple
        // heterozygous carrier: not herself homozygous-affected, and with no
        // mother who is herself a certain disease-X transmitter (a homozygous
        // affected mother always also contributes a disease X). Otherwise both
        // lines are genuine sources and neither may be dropped.
        const childIsHomozygousAffected = statuses.get(childId) === 'affected';
        const motherIsCertainTransmitter = onLineage.some(
          (p) =>
            p.sex === 'female' &&
            CERTAIN_X_TRANSMITTER_STATUSES.has(statuses.get(p.id) ?? 'unknown'),
        );
        if (
          affectedFathers.length > 0 &&
          !childIsHomozygousAffected &&
          !motherIsCertainTransmitter
        ) {
          return affectedFathers.map((p) => p.id);
        }
      }
      // X-linked dominant daughter, a recessive daughter sourced from the
      // maternal line, or an unknown-sex child: every on-lineage parent qualifies.
      return onLineage.map((p) => p.id);
    }

    default: {
      const exhaustive: never = pattern;
      return exhaustive;
    }
  }
}

/**
 * Computes the contributor highlight set for the narrative pedigree.
 *
 * When focalId is null, the whole pedigree is lit (nothing dimmed).
 * Otherwise, highlights the focal plus every ancestor reachable through a chain
 * of TRANSMITTING parents: from each node the walk continues only to parents who
 * could have passed the allele to it under the disease's inheritance pattern
 * (`transmittingParents`) and who are themselves on the disease lineage. Across
 * multiple shown diseases the per-disease eligible parents are unioned, so the
 * highlight is the union of each disease's true source line.
 *
 * @param focalId    The focal node id, or null for no dimming.
 * @param graph      The annotated genetic graph.
 * @param diseases   Per shown disease: its computed statuses and inheritance pattern.
 * @param resolveSex Resolver for a node's biological sex (for the sex-linked rules).
 */
export function computeContributors(
  focalId: string | null,
  graph: GeneticGraph,
  diseases: DiseaseContributors[],
  resolveSex: (id: string) => Sex,
): { nodes: Set<string>; edges: Set<string> } {
  if (focalId === null) {
    const nodes = new Set(graph.nodeIds());
    const edges = new Set<string>();
    for (const id of nodes)
      for (const c of graph.childrenOf(id))
        if (nodes.has(c)) edges.add(edgeKey(id, c));
    return { nodes, edges };
  }

  // Build the edge set DURING the walk so it lights only the parent→child links
  // the allele actually descended through. A pattern-agnostic "both endpoints are
  // contributors" pass would wrongly light, e.g., a father→son link in a
  // consanguineous X-linked pedigree where both men are contributors via other
  // paths but the son's X never came from his father.
  const edges = new Set<string>();
  const nodes = graph.propagate([focalId], (id) => {
    const parents = graph.parentsOf(id);
    const childSex = resolveSex(id);
    const next = new Set<string>();
    for (const { pattern, statuses } of diseases) {
      for (const pid of transmittingParents(
        pattern,
        id,
        childSex,
        parents,
        statuses,
      )) {
        next.add(pid);
      }
    }
    for (const pid of next) {
      edges.add(edgeKey(pid, id));
    }
    return [...next];
  });

  return { nodes, edges };
}
