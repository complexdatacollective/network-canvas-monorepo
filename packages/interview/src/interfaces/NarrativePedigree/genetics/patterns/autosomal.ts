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
 * True when `id` currently carries the disease allele under the active model,
 * i.e. is affected or a (computed) obligate. Used by the autosomal-dominant
 * skipped-generation rule, which keys off "affected/obligate" individuals.
 */
function isAffectedOrObligate(
  id: string,
  affected: Set<string>,
  result: Map<string, Status>,
): boolean {
  if (affected.has(id)) {
    return true;
  }
  const s = result.get(id);
  return s === 'obligateAffected' || s === 'obligateCarrier';
}

/**
 * Autosomal-dominant status computation (spec §3).
 *
 * - Affected nodes → `affected`.
 * - Descendants of an affected/obligate individual → `atRiskAffected`,
 *   propagated recursively over the lineage with a visited-set.
 * - An unaffected person who is BOTH a child of an affected/obligate individual
 *   AND a parent of an affected/obligate individual → `obligateCarrier`
 *   (unaffected-but-transmitting; reduced penetrance / skipped generation).
 *   Resolved to a fixed point because an obligate carrier can itself satisfy the
 *   "affected/obligate" predicate for a neighbouring generation.
 * - Parents of an affected person with NO affected ancestor are NEVER
 *   `obligateCarrier` (de novo vs non-penetrant); they receive no positive
 *   mark here and so resolve to `unknown` (consistent with the boolean-affected
 *   model, which must not broadcast false reassurance OR over-claim).
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

  // Skipped-generation obligate carriers. An unaffected person who sits BETWEEN
  // two affected/obligate individuals (child of one, parent of another) must
  // carry the allele. Iterate to a fixed point: a newly-marked obligate carrier
  // can complete the chain for an adjacent generation.
  let changed = true;
  while (changed) {
    changed = false;
    for (const childId of atRisk) {
      if (affected.has(childId)) {
        continue;
      }
      if (result.get(childId) === 'obligateCarrier') {
        continue;
      }

      const parents = graph.parentsOf(childId);
      const childOfAffectedOrObligate = parents.some((p) =>
        isAffectedOrObligate(p.id, affected, result),
      );
      if (!childOfAffectedOrObligate) {
        continue;
      }

      const parentOfAffectedOrObligate = graph
        .childrenOf(childId)
        .some((c) => isAffectedOrObligate(c, affected, result));
      if (!parentOfAffectedOrObligate) {
        continue;
      }

      assign(result, childId, 'obligateCarrier');
      changed = true;
    }
  }

  return result;
}

/**
 * Autosomal-recessive status computation (spec §3).
 *
 * - Affected nodes → `affected`.
 * - Both biological parents AND every child of an affected person →
 *   `obligateCarrier`.
 * - An unaffected FULL sibling of an affected person (both parents are
 *   affected/obligate, i.e. shares the affected's exact two-parent set) →
 *   `atRiskAffected` (25%).
 * - A person with EXACTLY ONE carrier parent — half-sibs of an affected, a child
 *   of a single carrier — and the parents/siblings of an obligate carrier (the
 *   affected's grandparents/aunts/uncles, each a 50%-prior carrier) →
 *   `atRiskCarrier`.
 *
 * Full-vs-half partitioning comes from `fullSiblingsOf`/`halfSiblingsOf`. Where
 * full-vs-half cannot be established, the person never reaches the
 * `atRiskAffected` rule and is downgraded to `atRiskCarrier` by the
 * one-carrier-parent / collateral rules.
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

  // Full vs half siblings of an affected person. Full siblings share BOTH
  // parents (both obligate carriers) → 25% atRiskAffected. Half siblings share
  // exactly one carrier parent → atRiskCarrier.
  for (const affectedId of affected) {
    for (const fullSibId of graph.fullSiblingsOf(affectedId)) {
      if (!affected.has(fullSibId)) {
        assign(result, fullSibId, 'atRiskAffected');
      }
    }
    for (const halfSibId of graph.halfSiblingsOf(affectedId)) {
      if (!affected.has(halfSibId)) {
        assign(result, halfSibId, 'atRiskCarrier');
      }
    }
  }

  // 50%-prior collaterals: the parents and siblings of every obligate carrier
  // (the affected's grandparents and aunts/uncles) each carry a 50% prior.
  // Snapshot the obligate-carrier set first so newly-assigned at-risk carriers
  // don't recursively seed further collaterals (the prior would decay).
  const obligateCarriers = [...result.entries()]
    .filter(([, s]) => s === 'obligateCarrier')
    .map(([id]) => id);

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
