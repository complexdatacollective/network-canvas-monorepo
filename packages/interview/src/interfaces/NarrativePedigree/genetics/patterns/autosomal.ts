import type { GeneticGraph } from '../geneticGraph';
import { mergeStatus, type Status } from '../status';

/**
 * Merge `value` into `result[id]`, respecting status precedence
 * (`affected > obligateAffected > obligateCarrier > atRiskAffected >
 * atRiskCarrier > unknown`). Nodes are only ever written when a rule produces a
 * non-`unknown` status, so omission from the map IS `unknown`.
 */
function assign(result: Map<string, Status>, id: string, value: Status): void {
  if (value === 'unknown') {
    return;
  }
  const existing = result.get(id) ?? 'unknown';
  result.set(id, mergeStatus(existing, value));
}

/**
 * Autosomal-dominant status computation (spec §3).
 *
 * - Affected nodes → `affected`.
 * - Descendants of an affected/obligate individual → `atRiskAffected`,
 *   propagated recursively over the lineage with a visited-set.
 * - An unaffected person who has at least one AFFECTED ANCESTOR AND at least one
 *   AFFECTED DESCENDANT → `obligateCarrier` (unaffected-but-transmitting; the
 *   allele must pass through them from the affected ancestor to the affected
 *   descendant). This is exact for skipped generations of arbitrary length: the
 *   single-intermediate case (parent between two affected) and the
 *   multi-intermediate case (A→B→C→D, affected A,D) both resolve correctly,
 *   without the single-step fixed-point that deadlocks on ≥2 consecutive
 *   unaffected intermediates.
 * - Parents of an affected person with NO affected ancestor are NEVER
 *   `obligateCarrier` (de novo vs non-penetrant) — they have no affected
 *   ancestor, so the rule above correctly excludes them. They receive only the
 *   descendant `atRiskAffected` mark (or `unknown`), never false reassurance OR
 *   over-claim.
 */
export function computeAutosomalDominant(
  graph: GeneticGraph,
  affected: Set<string>,
): Map<string, Status> {
  const result = new Map<string, Status>();

  for (const id of affected) {
    assign(result, id, 'affected');
  }

  // Descendants of each affected individual are at risk of being affected.
  // `propagate` carries a visited-set so consanguinity loops terminate.
  const atRisk = graph.propagate(
    [...affected],
    (id) => graph.childrenOf(id),
    new Set<string>(),
  );
  for (const id of atRisk) {
    if (!affected.has(id)) {
      assign(result, id, 'atRiskAffected');
    }
  }

  // Obligate carriers: an unaffected person with an affected ancestor AND an
  // affected descendant must carry the transmitting allele. `ancestors`/
  // `descendants` are visited-set BFS, so consanguinity loops terminate.
  for (const id of atRisk) {
    if (affected.has(id)) {
      continue;
    }
    const hasAffectedAncestor = [...graph.ancestors(id)].some((a) =>
      affected.has(a),
    );
    if (!hasAffectedAncestor) {
      continue;
    }
    const hasAffectedDescendant = [...graph.descendants(id)].some((d) =>
      affected.has(d),
    );
    if (!hasAffectedDescendant) {
      continue;
    }
    assign(result, id, 'obligateCarrier');
  }

  return result;
}

/**
 * Autosomal-recessive status computation (spec §3).
 *
 * - Affected nodes → `affected`.
 * - A non-nominated person BOTH of whose genetic parents are nominated
 *   `affected` → `obligateAffected` (pseudodominance: a child of two homozygous-
 *   affected parents is deterministically affected, 100%). `obligateAffected`
 *   outranks `obligateCarrier`, so it upgrades the parent-of-affected rule.
 * - Both biological parents AND every child of an affected person →
 *   `obligateCarrier`.
 * - A relative gets `atRiskAffected` (25%, full sibling) ONLY when the full-
 *   sibling relationship is ESTABLISHED, expressed as: ≥2 of the person's
 *   genetic parents are obligate carriers (the affected's carrier parents).
 *   Exactly 1 carrier parent → `atRiskCarrier`. This automatically downgrades
 *   the incomplete-data case (only one recorded parent → at most 1 carrier
 *   parent) and preserves true full-sibs (both carrier parents recorded).
 * - The parents/siblings of an obligate carrier (the affected's grandparents/
 *   aunts/uncles, each a 50%-prior carrier) → `atRiskCarrier`.
 */
export function computeAutosomalRecessive(
  graph: GeneticGraph,
  affected: Set<string>,
): Map<string, Status> {
  const result = new Map<string, Status>();

  for (const id of affected) {
    assign(result, id, 'affected');
  }

  // Both parents and every child of an affected person are obligate carriers.
  for (const affectedId of affected) {
    for (const parent of graph.parentsOf(affectedId)) {
      if (!affected.has(parent.id)) {
        assign(result, parent.id, 'obligateCarrier');
      }
    }
    for (const childId of graph.childrenOf(affectedId)) {
      if (!affected.has(childId)) {
        assign(result, childId, 'obligateCarrier');
      }
    }
  }

  // Snapshot the obligate carriers (the affected's parents and children) before
  // any downstream assignment, so the carrier-parent count and collateral spread
  // below both key off this stable set rather than later at-risk marks.
  const obligateCarriers = new Set(
    [...result.entries()]
      .filter(([, s]) => s === 'obligateCarrier')
      .map(([id]) => id),
  );

  // Pseudodominance: a non-nominated person both of whose genetic parents are
  // nominated affected is obligately affected (100%).
  for (const affectedId of affected) {
    for (const childId of graph.childrenOf(affectedId)) {
      if (affected.has(childId)) {
        continue;
      }
      const parents = graph.parentsOf(childId);
      const bothParentsAffected =
        parents.length >= 2 && parents.every((p) => affected.has(p.id));
      if (bothParentsAffected) {
        assign(result, childId, 'obligateAffected');
      }
    }
  }

  // Sibling / relative risk tier, by how many of the person's genetic parents
  // are obligate carriers (the affected's carrier parents). Full siblings have
  // BOTH carrier parents recorded → atRiskAffected (25%); a person with exactly
  // one recorded carrier parent (a half-sib, or a sib whose full-vs-half status
  // is unestablishable because the other parent is unrecorded) → atRiskCarrier.
  const relatives = new Set<string>();
  for (const carrierId of obligateCarriers) {
    for (const childId of graph.childrenOf(carrierId)) {
      if (!affected.has(childId)) {
        relatives.add(childId);
      }
    }
  }
  for (const relativeId of relatives) {
    const carrierParentCount = graph
      .parentsOf(relativeId)
      .filter((p) => obligateCarriers.has(p.id)).length;
    if (carrierParentCount >= 2) {
      assign(result, relativeId, 'atRiskAffected');
    } else if (carrierParentCount === 1) {
      assign(result, relativeId, 'atRiskCarrier');
    }
  }

  // 50%-prior collaterals: the parents and siblings of every obligate carrier
  // (the affected's grandparents and aunts/uncles) each carry a 50% prior.
  // Reuse the obligate-carrier snapshot so newly-assigned at-risk carriers
  // don't recursively seed further collaterals (the prior would decay).
  for (const carrierId of obligateCarriers) {
    for (const parent of graph.parentsOf(carrierId)) {
      if (!affected.has(parent.id)) {
        assign(result, parent.id, 'atRiskCarrier');
      }
    }
    for (const sibId of graph.fullSiblingsOf(carrierId)) {
      if (!affected.has(sibId)) {
        assign(result, sibId, 'atRiskCarrier');
      }
    }
    for (const sibId of graph.halfSiblingsOf(carrierId)) {
      if (!affected.has(sibId)) {
        assign(result, sibId, 'atRiskCarrier');
      }
    }
    // Children of a single obligate carrier (other than the affected) inherit a
    // 50% prior to be carriers themselves.
    for (const childId of graph.childrenOf(carrierId)) {
      if (!affected.has(childId)) {
        assign(result, childId, 'atRiskCarrier');
      }
    }
  }

  return result;
}
