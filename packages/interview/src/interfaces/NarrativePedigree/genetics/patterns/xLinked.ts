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
 *   on TWO SIDES of her and no one man could explain all of it through his
 *   daughters. A side is the line of one of her children or her genetic
 *   mother's family. A daughter's line is the daughter if affected plus her
 *   children's lines. Her mother's family is the mother if affected, the
 *   mother's affected father, the lines of the mother's other children, and
 *   the mother's own mother's family in turn. A female on any of these routes
 *   passes nothing on when another parent of hers is affected. An affected
 *   female with no recorded father passes nothing on either and is not
 *   evidence herself, since that father may be affected. Two sides must rest
 *   on at least two different affected people. A man could explain an
 *   affected person when he fathered a female on the route to them (the
 *   person included), because a single event in him (a germline mosaic, or an
 *   affected man not recorded as such) would reach them through his daughter.
 *   A female with no recorded father stands for an unrecorded man and for
 *   every recorded father of her mother's other children. Affected men
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
  // sides of her (each child's line, and her mother's family) and no one man
  // could explain all of it through his daughters. Each side maps every
  // affected person standing as its evidence to the fathers who could have
  // passed it down to them: the fathers of the females on the route to that
  // person. `path` holds the people on the current walk, so a loop in the
  // recorded links ends the walk instead of repeating it.
  type Evidence = Map<string, Set<string>>;
  const noFathers = new Set<string>();

  const addWitness = (
    evidence: Evidence,
    id: string,
    fathers: Set<string>,
  ): void => {
    const existing = evidence.get(id);
    evidence.set(id, existing ? new Set([...existing, ...fathers]) : fathers);
  };

  const recordedFathersOf = (childId: string, motherId: string): string[] =>
    graph
      .parentsOf(childId)
      .filter((parent) => parent.id !== motherId && parent.sex === 'male')
      .map((parent) => parent.id);

  // The fathers who could have passed the X down to `daughterId`. A daughter
  // with no recorded father may share a father with any of her mother's other
  // children, so she stands for an unrecorded man and for each of theirs.
  const fathersOfDaughter = (
    daughterId: string,
    motherId: string,
  ): string[] => {
    const recorded = recordedFathersOf(daughterId, motherId);
    if (recorded.length > 0) {
      return recorded;
    }
    const siblingsFathers = graph
      .childrenOf(motherId)
      .filter((id) => id !== daughterId)
      .flatMap((id) => recordedFathersOf(id, motherId));
    return [`unrecorded:${motherId}`, ...siblingsFathers];
  };

  // The affected people in the X line that runs from `motherId` down through
  // her genetic child `childId`, with the fathers along the way. A son's line
  // is the son himself. A daughter's line is blocked when another parent of
  // hers is affected, because that parent's X would explain everything below
  // her. An affected daughter with no recorded father blocks it too, since
  // that father may be affected; a daughter who only links to affected people
  // further down needs no recorded father.
  const evidenceBelow = (
    childId: string,
    motherId: string,
    path: Set<string>,
    fathersAbove: Set<string>,
  ): Evidence => {
    const evidence: Evidence = new Map();
    if (path.has(childId)) {
      return evidence;
    }
    const childSex = resolveSex(childId);
    if (childSex === 'male') {
      if (affected.has(childId)) {
        evidence.set(childId, fathersAbove);
      }
      return evidence;
    }
    if (childSex !== 'female') {
      return evidence;
    }
    const otherParents = graph
      .parentsOf(childId)
      .filter((parent) => parent.id !== motherId);
    if (otherParents.some((parent) => affected.has(parent.id))) {
      return evidence;
    }
    const fathers = new Set([
      ...fathersAbove,
      ...fathersOfDaughter(childId, motherId),
    ]);
    if (affected.has(childId)) {
      if (!otherParents.some((parent) => parent.sex === 'male')) {
        return evidence;
      }
      evidence.set(childId, fathers);
    }
    path.add(childId);
    for (const grandchildId of graph.childrenOf(childId)) {
      const below = evidenceBelow(grandchildId, childId, path, fathers);
      for (const [id, witnessFathers] of below) {
        addWitness(evidence, id, witnessFathers);
      }
    }
    path.delete(childId);
    return evidence;
  };

  // The affected people in the family of `womanId`'s genetic mother: the
  // mother herself, the mother's affected father, the lines of the mother's
  // other children, and the same again one generation up.
  const evidenceAbove = (womanId: string, path: Set<string>): Evidence => {
    const evidence: Evidence = new Map();
    for (const { id: motherId } of mothersOf(graph, womanId)) {
      if (path.has(motherId)) {
        continue;
      }
      if (affected.has(motherId)) {
        addWitness(evidence, motherId, noFathers);
      }
      for (const parent of graph.parentsOf(motherId)) {
        if (parent.sex === 'male' && affected.has(parent.id)) {
          addWitness(evidence, parent.id, noFathers);
        }
      }
      path.add(motherId);
      // `womanId` is on `path`, so her own line is never counted here.
      for (const siblingId of graph.childrenOf(motherId)) {
        const below = evidenceBelow(siblingId, motherId, path, noFathers);
        for (const [id, fathers] of below) {
          addWitness(evidence, id, fathers);
        }
      }
      for (const [id, fathers] of evidenceAbove(motherId, path)) {
        addWitness(evidence, id, fathers);
      }
      path.delete(motherId);
    }
    return evidence;
  };

  for (const womanId of graph.nodeIds()) {
    if (resolveSex(womanId) !== 'female' || affected.has(womanId)) {
      continue;
    }
    const path = new Set([womanId]);
    const sides = [
      ...graph
        .childrenOf(womanId)
        .map((childId) => evidenceBelow(childId, womanId, path, noFathers)),
      evidenceAbove(womanId, path),
    ].filter((side) => side.size > 0);
    const witnesses: Evidence = new Map();
    for (const side of sides) {
      for (const [id, fathers] of side) {
        addWitness(witnesses, id, fathers);
      }
    }
    // A man who could have passed it to every affected person would explain
    // all of the sides without her, however many there are.
    const [first, ...rest] = [...witnesses.values()];
    const sharedFathers = [...(first ?? noFathers)].filter((father) =>
      rest.every((fathers) => fathers.has(father)),
    );
    if (
      sides.length >= 2 &&
      witnesses.size >= 2 &&
      sharedFathers.length === 0
    ) {
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
