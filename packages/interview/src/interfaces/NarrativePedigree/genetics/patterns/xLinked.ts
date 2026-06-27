import type { GeneticGraph } from '../geneticGraph';
import { mergeStatus, type Status } from '../status';

type Sex = 'female' | 'male' | 'unknown';

/**
 * Merge `value` into `result[id]`, respecting status precedence
 * (`affected > obligateAffected > obligateCarrier > atRiskAffected >
 * atRiskCarrier > unknown`). A rule only ever writes a non-`unknown` status, so
 * omission from the map IS `unknown` (including the sex-blocked case).
 */
function assign(result: Map<string, Status>, id: string, value: Status): void {
  if (value === 'unknown') {
    return;
  }
  const existing = result.get(id) ?? 'unknown';
  result.set(id, mergeStatus(existing, value));
}

/**
 * Female ancestors of `id` reached by walking strictly up through female
 * parents (the maternal line), including `id` only if requested. This is the
 * X-bearing maternal lineage: a female inherits one X from her mother, so an
 * affected male anywhere on this lineage shares the carrier X with `id`.
 */
function maternalLineFemales(
  graph: GeneticGraph,
  resolveSex: (id: string) => Sex,
  id: string,
): Set<string> {
  const femaleParents = (nodeId: string): string[] =>
    graph
      .parentsOf(nodeId)
      .filter((parent) => parent.sex === 'female')
      .map((parent) => parent.id);

  // BFS strictly up the female (maternal) line. `propagate` carries a
  // visited-set so consanguinity loops terminate.
  const line = graph.propagate([id], femaleParents, new Set<string>());
  line.delete(id);
  return line;
}

/**
 * X-linked recessive status computation (spec §3).
 *
 * The disease allele rides the X chromosome and is masked in females. The
 * computation is carrier-female-centric: every transmission path runs through a
 * carrier female (an affected male's only X always reaches all of his daughters,
 * never his sons). Status flows DOWN from carrier females and UP the maternal
 * line, with a visited-set so consanguinity loops terminate.
 *
 * Rules:
 * - Affected nodes → `affected`.
 * - Every DAUGHTER (female child) of an affected male → `obligateCarrier` (he
 *   passes his single X to all daughters). His SONS get the Y → nothing.
 * - A female with ≥2 affected sons, OR an affected son AND another affected
 *   maternal-line male (her father / brother / maternal uncle on the X lineage)
 *   → `obligateCarrier`.
 * - The mother of a SINGLE affected male with no other affected male relative →
 *   `atRiskCarrier` (de novo is not excluded — NOT obligate).
 * - The maternal grandmother and maternal aunts of an affected male →
 *   `atRiskCarrier`; the maternal uncles → `atRiskAffected`.
 * - From every carrier female (obligate or at-risk), DAUGHTERS → `atRiskCarrier`
 *   (themselves carrier females, recursed) and SONS → `atRiskAffected`. NO
 *   male-to-male transmission.
 * - A person whose sex is `unknown` in a sex-dependent step → `unknown`
 *   (sex-blocked); such a node is simply never written.
 */
export function computeXLinkedRecessive(
  graph: GeneticGraph,
  affected: Set<string>,
  resolveSex: (id: string) => Sex,
): Map<string, Status> {
  const result = new Map<string, Status>();

  for (const id of affected) {
    assign(result, id, 'affected');
  }

  // Carrier females discovered with their tier. Obligate beats at-risk; a female
  // already obligate is never downgraded. Seeded here, then propagated down.
  const obligateCarrierFemales = new Set<string>();
  const atRiskCarrierFemales = new Set<string>();

  const markObligateFemale = (id: string): void => {
    if (resolveSex(id) !== 'female' || affected.has(id)) {
      return;
    }
    obligateCarrierFemales.add(id);
    atRiskCarrierFemales.delete(id);
  };

  const markAtRiskFemale = (id: string): void => {
    if (
      resolveSex(id) !== 'female' ||
      affected.has(id) ||
      obligateCarrierFemales.has(id)
    ) {
      return;
    }
    atRiskCarrierFemales.add(id);
  };

  // (1) Every daughter of an affected MALE is an obligate carrier; his sons get
  // nothing (the Y, not the X) — no male-to-male transmission.
  for (const affectedId of affected) {
    if (resolveSex(affectedId) !== 'male') {
      continue;
    }
    for (const childId of graph.childrenOf(affectedId)) {
      if (resolveSex(childId) === 'female') {
        markObligateFemale(childId);
      }
    }
  }

  // (2) Mothers of affected males, plus the maternal-line collaterals of each
  // affected male.
  for (const affectedId of affected) {
    if (resolveSex(affectedId) !== 'male') {
      continue;
    }

    const mothers = graph
      .parentsOf(affectedId)
      .filter((parent) => parent.sex === 'female')
      .map((parent) => parent.id);

    for (const motherId of mothers) {
      // Affected sons of THIS mother (the affected male is one of them).
      const affectedSons = graph
        .childrenOf(motherId)
        .filter(
          (childId) => resolveSex(childId) === 'male' && affected.has(childId),
        );

      // Another affected maternal-line male shared with the mother: an affected
      // male (≠ her affected sons) who lies on her X lineage — a male ancestor
      // of the mother, or a son of one of her maternal-line female ancestors
      // (her brother, maternal uncle, maternal grandfather, …).
      const motherLineFemales = maternalLineFemales(
        graph,
        resolveSex,
        motherId,
      );
      const sonSet = new Set(affectedSons);
      const hasOtherMaternalLineMale = [...affected].some((maleId) => {
        if (resolveSex(maleId) !== 'male' || sonSet.has(maleId)) {
          return false;
        }
        // A male ancestor of the mother shares her X lineage.
        if (graph.ancestors(motherId).has(maleId)) {
          return true;
        }
        // A male whose mother is on the mother's maternal-line shares the X.
        return graph
          .parentsOf(maleId)
          .some(
            (parent) =>
              parent.sex === 'female' && motherLineFemales.has(parent.id),
          );
      });

      if (affectedSons.length >= 2 || hasOtherMaternalLineMale) {
        markObligateFemale(motherId);
      } else {
        // Single affected son, no other affected maternal-line male: de novo is
        // not excluded → at-risk carrier, NOT obligate.
        markAtRiskFemale(motherId);
      }
    }

    // Maternal grandmother + maternal aunts (mother's female parents/sisters) →
    // atRiskCarrier; maternal uncles (mother's brothers) → atRiskAffected.
    for (const motherId of mothers) {
      for (const grandparent of graph.parentsOf(motherId)) {
        if (grandparent.sex === 'female') {
          markAtRiskFemale(grandparent.id);
        }
      }
      const maternalSiblings = [
        ...graph.fullSiblingsOf(motherId),
        ...graph.halfSiblingsOf(motherId),
      ];
      for (const siblingId of maternalSiblings) {
        const siblingSex = resolveSex(siblingId);
        if (siblingSex === 'female') {
          markAtRiskFemale(siblingId);
        } else if (siblingSex === 'male' && !affected.has(siblingId)) {
          assign(result, siblingId, 'atRiskAffected');
        }
      }
    }
  }

  // (3) Propagate DOWN from every carrier female (obligate and at-risk) through
  // the maternal line: daughters become at-risk carrier females (recursed via
  // the visited-set), sons become at-risk affected. No male-to-male step.
  const carrierFemaleSeeds = [
    ...obligateCarrierFemales,
    ...atRiskCarrierFemales,
  ];
  const visitedFemales = new Set<string>();
  graph.propagate(
    carrierFemaleSeeds,
    (femaleId) => {
      const daughters: string[] = [];
      for (const childId of graph.childrenOf(femaleId)) {
        const childSex = resolveSex(childId);
        if (childSex === 'female') {
          if (!affected.has(childId)) {
            markAtRiskFemale(childId);
          }
          daughters.push(childId);
        } else if (childSex === 'male' && !affected.has(childId)) {
          assign(result, childId, 'atRiskAffected');
        }
      }
      // Only daughters continue the X lineage downward.
      return daughters;
    },
    visitedFemales,
  );

  // Finally, fold the carrier-female tiers into the result with precedence.
  for (const id of obligateCarrierFemales) {
    assign(result, id, 'obligateCarrier');
  }
  for (const id of atRiskCarrierFemales) {
    assign(result, id, 'atRiskCarrier');
  }

  return result;
}

/**
 * X-linked dominant status computation (spec §3).
 *
 * One affected X copy suffices, so the disease shows in both sexes, but
 * transmission is still sex-asymmetric: an affected male gives his single X to
 * ALL daughters and his Y to all sons; an affected female gives an affected X to
 * ~50% of every child. Recurses through affected descendants with a visited-set.
 *
 * Rules:
 * - Affected nodes → `affected`.
 * - Every DAUGHTER of an affected MALE → `obligateAffected` (he transmits his X
 *   to all daughters). His SONS receive no risk via him (left to other rules /
 *   omitted).
 * - Each CHILD (either sex) of an affected/transmitting FEMALE → `atRiskAffected`.
 * - Recurse: an obligately-affected daughter and any at-risk-affected descendant
 *   transmit onward by the same sex rules.
 * - Unknown sex in a sex-dependent step → `unknown` (sex-blocked); never written.
 */
export function computeXLinkedDominant(
  graph: GeneticGraph,
  affected: Set<string>,
  resolveSex: (id: string) => Sex,
): Map<string, Status> {
  const result = new Map<string, Status>();

  for (const id of affected) {
    assign(result, id, 'affected');
  }

  // Daughters of affected males: inferred affected via the paternal X. An
  // affected male transmits his single X to every daughter (and his Y, not the
  // X, to every son — so sons get nothing via him).
  const obligateAffected = new Set<string>();
  for (const id of affected) {
    if (resolveSex(id) !== 'male') {
      continue;
    }
    for (const childId of graph.childrenOf(id)) {
      if (resolveSex(childId) === 'female' && !affected.has(childId)) {
        obligateAffected.add(childId);
      }
    }
  }

  // Propagate through affected descendants with a visited-set. From a
  // transmitting female every child is at-risk affected; an at-risk-affected
  // daughter transmits onward to all her children, and an at-risk-affected
  // male transmits onward (at-risk) only to his daughters. We BFS over the
  // affected/obligate-affected seeds, accreting at-risk descendants.
  const atRiskAffected = new Set<string>();
  const visited = new Set<string>([...affected, ...obligateAffected]);

  graph.propagate(
    [...affected, ...obligateAffected],
    (carrierId) => {
      const next: string[] = [];
      const carrierSex = resolveSex(carrierId);

      if (carrierSex === 'female') {
        // A transmitting female passes the affected X to ~50% of every child.
        for (const childId of graph.childrenOf(carrierId)) {
          if (affected.has(childId) || obligateAffected.has(childId)) {
            continue;
          }
          atRiskAffected.add(childId);
          next.push(childId);
        }
      } else if (carrierSex === 'male') {
        // An affected/at-risk male transmits his X only to daughters
        // (obligately affected when the male is nominated/inferred affected;
        // here at-risk males pass on at-risk affected). No male-to-male step.
        for (const childId of graph.childrenOf(carrierId)) {
          if (
            resolveSex(childId) === 'female' &&
            !affected.has(childId) &&
            !obligateAffected.has(childId)
          ) {
            atRiskAffected.add(childId);
            next.push(childId);
          }
        }
      }

      return next;
    },
    visited,
  );

  for (const id of obligateAffected) {
    assign(result, id, 'obligateAffected');
  }
  for (const id of atRiskAffected) {
    assign(result, id, 'atRiskAffected');
  }

  return result;
}
