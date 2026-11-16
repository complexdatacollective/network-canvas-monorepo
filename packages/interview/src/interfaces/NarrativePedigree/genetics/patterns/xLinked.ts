import type { AnnotatedParent, GeneticGraph } from '../geneticGraph';
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
 * The female (maternal) parents of `id`. Relies on the graph's pre-annotated
 * `parent.sex`, so no `resolveSex` is needed here.
 */
function mothersOf(graph: GeneticGraph, id: string): AnnotatedParent[] {
  return graph.parentsOf(id).filter((parent) => parent.sex === 'female');
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
 * - A female not recorded affected → `obligateCarrier` when the condition shows
 *   on TWO SIDES of her. A side is an affected son, the lines of her daughters
 *   by one recorded father, or her genetic mother's family. Daughters with no
 *   recorded father give a side only when no recorded father's daughters do,
 *   since an unrecorded father may be one of the recorded ones. A daughter's line is the daughter if affected
 *   plus her children's lines. Her mother's family is the mother if affected,
 *   the mother's affected father, the lines of the mother's other children,
 *   and the mother's own mother's family in turn. A female on any of these
 *   routes passes nothing on when another parent of hers is affected, and an
 *   affected female counts only when she also has a recorded father. Two sides
 *   must rest on at least two different affected people. If she did not carry
 *   it, the two sides would need separate rare events to coincide, the same
 *   alternative the two-affected-sons case already sets aside. Daughters by one
 *   father are one side because a single event in him (a germline mosaic, or
 *   an affected man not recorded as such) would explain them all. Affected men
 *   reached only through an unbroken male line give nothing.
 * - Otherwise the mother of an affected male → `atRiskCarrier` (a new variant
 *   in him is not excluded).
 * - The maternal grandmother and maternal aunts of an affected male →
 *   `atRiskCarrier`; the maternal uncles → `atRiskAffected`.
 * - From every carrier female (obligate or at-risk) and every AFFECTED female,
 *   DAUGHTERS → `atRiskCarrier` (themselves carrier females, recursed) and SONS
 *   → `atRiskAffected`. An affected female may be homozygous or a manifesting
 *   heterozygote, so her children are only ever at risk. On its own her
 *   affected status adds nothing about her parents; it can be one of the two
 *   sides above.
 *   NO male-to-male transmission.
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

    const mothers = mothersOf(graph, affectedId).map((parent) => parent.id);

    // A new variant in the son is not excluded, so his mother is at risk
    // unless step (2b) finds the condition on two sides of her.
    for (const motherId of mothers) {
      markAtRiskFemale(motherId);
    }

    // Maternal grandmother + maternal aunts (mother's female parents/sisters) →
    // atRiskCarrier; maternal uncles (mother's brothers) → atRiskAffected.
    for (const motherId of mothers) {
      for (const grandparent of graph.parentsOf(motherId)) {
        if (grandparent.sex === 'female') {
          markAtRiskFemale(grandparent.id);
        }
      }
      // Only the mother's MATERNAL-line siblings share the maternal
      // grandmother's X. Full siblings share both parents (hence the
      // grandmother); half-siblings count only when they share her mother — a
      // PATERNAL half-sibling (shared grandfather only) carries none of the
      // grandmother's disease-bearing X and must not be marked at risk.
      const maternalSiblings = [
        ...graph.fullSiblingsOf(motherId),
        ...graph.maternalHalfSiblingsOf(motherId),
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

  // (2b) A female is an obligate carrier when the condition shows on two
  // sides of her: an affected son, the lines of her daughters by one father,
  // or her mother's family. Each side is the set of affected people that
  // stand as its evidence, and two sides count only when they do not rest on
  // the same single person. `path` holds the people on the current walk, so a
  // loop in the recorded links ends the walk instead of repeating it.
  const none = new Set<string>();

  // The affected people in the X line that runs from `motherId` down through
  // her genetic child `childId`. A son's line is the son himself. A daughter's
  // line is blocked when another parent of hers is affected, because that
  // parent's X would explain everything below her. A daughter who is herself
  // affected stands as evidence only when she has a recorded father, since an
  // unrecorded father may be affected; a daughter who only links to affected
  // people further down needs no recorded father.
  const evidenceBelow = (
    childId: string,
    motherId: string,
    path: Set<string>,
  ): Set<string> => {
    if (path.has(childId)) {
      return none;
    }
    const childSex = resolveSex(childId);
    if (childSex === 'male') {
      return affected.has(childId) ? new Set([childId]) : none;
    }
    if (childSex !== 'female') {
      return none;
    }
    const otherParents = graph
      .parentsOf(childId)
      .filter((parent) => parent.id !== motherId);
    if (otherParents.some((parent) => affected.has(parent.id))) {
      return none;
    }
    const witnesses = new Set<string>();
    if (affected.has(childId)) {
      if (!otherParents.some((parent) => parent.sex === 'male')) {
        return none;
      }
      witnesses.add(childId);
    }
    path.add(childId);
    for (const grandchildId of graph.childrenOf(childId)) {
      for (const id of evidenceBelow(grandchildId, childId, path)) {
        witnesses.add(id);
      }
    }
    path.delete(childId);
    return witnesses;
  };

  // The affected people in the family of `womanId`'s genetic mother: the
  // mother herself, the mother's affected father, the lines of the mother's
  // other children, and the same again one generation up.
  const evidenceAbove = (womanId: string, path: Set<string>): Set<string> => {
    const witnesses = new Set<string>();
    for (const { id: motherId } of mothersOf(graph, womanId)) {
      if (path.has(motherId)) {
        continue;
      }
      if (affected.has(motherId)) {
        witnesses.add(motherId);
      }
      for (const parent of graph.parentsOf(motherId)) {
        if (parent.sex === 'male' && affected.has(parent.id)) {
          witnesses.add(parent.id);
        }
      }
      path.add(motherId);
      // `womanId` is on `path`, so her own line is never counted here.
      for (const siblingId of graph.childrenOf(motherId)) {
        for (const id of evidenceBelow(siblingId, motherId, path)) {
          witnesses.add(id);
        }
      }
      for (const id of evidenceAbove(motherId, path)) {
        witnesses.add(id);
      }
      path.delete(motherId);
    }
    return witnesses;
  };

  // Which side below `womanId` her child's line belongs to. Each son is his
  // own side. Daughters by one father share a side: a single event in him (a
  // germline mosaic, or an affected man not recorded as such) would explain
  // all of their lines. Daughters with no recorded father share the
  // `noRecordedFather` key, since they may have one father.
  const noRecordedFather = 'father:';
  const sideBelow = (childId: string, womanId: string): string => {
    if (resolveSex(childId) !== 'female') {
      return `child:${childId}`;
    }
    const fathers = graph
      .parentsOf(childId)
      .filter((parent) => parent.id !== womanId && parent.sex === 'male')
      .map((parent) => parent.id);
    return `${noRecordedFather}${fathers.join(',')}`;
  };

  for (const womanId of graph.nodeIds()) {
    if (resolveSex(womanId) !== 'female' || affected.has(womanId)) {
      continue;
    }
    const path = new Set([womanId]);
    const below = new Map<string, Set<string>>();
    for (const childId of graph.childrenOf(womanId)) {
      const key = sideBelow(childId, womanId);
      const side = below.get(key) ?? new Set<string>();
      for (const id of evidenceBelow(childId, womanId, path)) {
        side.add(id);
      }
      below.set(key, side);
    }
    // An unrecorded father may be one of the recorded fathers, so daughters
    // with no recorded father add a side only when no recorded father's
    // daughters give one. Otherwise their affected people join a recorded
    // father's side rather than standing apart.
    const unrecorded = below.get(noRecordedFather);
    below.delete(noRecordedFather);
    if (unrecorded && unrecorded.size > 0) {
      const recordedSide = [...below.entries()].find(
        ([key, side]) => key.startsWith(noRecordedFather) && side.size > 0,
      )?.[1];
      if (recordedSide) {
        for (const id of unrecorded) {
          recordedSide.add(id);
        }
      } else {
        below.set(noRecordedFather, unrecorded);
      }
    }
    const sides = [...below.values(), evidenceAbove(womanId, path)].filter(
      (side) => side.size > 0,
    );
    const witnesses = new Set(sides.flatMap((side) => [...side]));
    if (sides.length >= 2 && witnesses.size >= 2) {
      markObligateFemale(womanId);
    }
  }

  // (3) Propagate DOWN from every carrier female (obligate and at-risk) and
  // every affected female through the maternal line: daughters become at-risk
  // carrier females (recursed via the visited-set), sons become at-risk
  // affected. No male-to-male step.
  const affectedFemales = [...affected].filter(
    (id) => resolveSex(id) === 'female',
  );
  const carrierFemaleSeeds = [
    ...obligateCarrierFemales,
    ...atRiskCarrierFemales,
    ...affectedFemales,
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
