/**
 * Builds an abstract kinship skeleton around ego — people, unions, sibships and
 * parentage — with no knowledge of Network Canvas at all.
 *
 * The ordering matters and is the inverse of what the previous generator did: a
 * genetically coherent pedigree must settle sex, generation and union *before*
 * drawing parentage, because who can contribute which gamete follows from those
 * three. Drawing parentage first and labelling afterwards cannot be made
 * consistent.
 *
 * Four generations around ego covers everything the interface renders:
 * grandparents (−2), parents and their siblings (−1), ego with siblings and
 * cousins (0), and children (+1).
 */

import {
  chance,
  type PedigreeDemography,
  type Rng,
  sampleSibshipOfKnownChild,
  sampleSibshipOfKnownParent,
  sampleSibshipUnconditioned,
} from './demography.ts';

export type StructuralSex = 'female' | 'male';

export type RelationshipType =
  | 'biological'
  | 'social'
  | 'donor'
  | 'surrogate'
  | 'adoptive';

export type GameteRole = 'egg' | 'sperm';

export type AbstractPerson = {
  id: string;
  /** Relative to ego: −2 grandparents, −1 parents, 0 ego's generation, +1 children. */
  generation: number;
  sex: StructuralSex;
  isEgo: boolean;
  /**
   * Whether this person married or partnered in rather than descending from
   * anyone on the pedigree. Founders legitimately have no parents; everyone
   * else must have at least two.
   */
  isFounder: boolean;
};

export type ParentLink = {
  parent: string;
  relationshipType: RelationshipType;
  gameteRole?: GameteRole;
  isGestationalCarrier?: boolean;
};

export type Union = {
  a: string;
  b: string;
  isActive: boolean;
};

export type AbstractPedigree = {
  egoId: string;
  people: AbstractPerson[];
  /** Child id → the links naming that child's parents. */
  parents: Map<string, ParentLink[]>;
  unions: Union[];
  /**
   * Whether ego affirmed having no children, which is the other way to satisfy
   * `requireChildrenContributors`. Written to stage metadata, where the
   * interface's own completeness check reads it.
   */
  noChildrenAffirmed: boolean;
};

/**
 * The most people the trim can never remove, because a completeness boundary
 * reaches them.
 *
 * Ego, two parents and four grandparents; ego's children and each child's other
 * parent, plus that parent's own two generations; and a donor or carrier on any
 * of them, but only where the stage's boundaries actually reach that far — so
 * the floor is a function of the stage, not a constant.
 *
 * Measured over 8,000 runs per setting, across both modes: 8 with the
 * grandparents boundary off or required — a kept child keeps every one of its
 * parents, so ego's own contributors and their partners come along — and 20
 * when the children-contributors boundary pulls in a co-parent's own two
 * generations. A configured cap below the applicable floor cannot be honoured —
 * the structure wins,
 * because emitting a pedigree the interface refuses to finalize is worse than
 * exceeding a budget — so feasibility counts against this floor rather than
 * against the cap alone.
 */
export function pedigreeStructuralFloor(
  boundaries: PedigreeBoundaries | undefined,
): number {
  if (boundaries?.requireChildrenContributors === 'required') return 20;
  return 8;
}

/** How strictly a boundary is enforced. Mirrors the stage's own config. */
export type BoundarySeverity = 'required' | 'recommended' | 'off';

export type PedigreeBoundaries = {
  requireGrandparents: BoundarySeverity;
  requireChildrenContributors: BoundarySeverity;
};

export type KinshipOptions = {
  boundaries?: PedigreeBoundaries;
  maxPeople?: number;
  /**
   * Lower bound on people. The structure is drawn from fertility distributions,
   * which can land well under a caller's floor, so the ascent is extended a
   * generation at a time until the floor is met or there is nothing left to
   * add.
   */
  minPeople?: number;
};

type Builder = {
  rng: Rng;
  demography: PedigreeDemography;
  people: AbstractPerson[];
  parents: Map<string, ParentLink[]>;
  unions: Union[];
  counter: { value: number };
};

function addPerson(
  builder: Builder,
  prefix: string,
  generation: number,
  sex: StructuralSex,
  options: { isEgo?: boolean; isFounder?: boolean } = {},
): AbstractPerson {
  builder.counter.value += 1;
  const person: AbstractPerson = {
    id: `${prefix}-${builder.counter.value}`,
    generation,
    sex,
    isEgo: options.isEgo ?? false,
    isFounder: options.isFounder ?? false,
  };
  builder.people.push(person);
  return person;
}

function randomSex(builder: Builder): StructuralSex {
  return chance(builder.rng, builder.demography.maleRate) ? 'male' : 'female';
}

/**
 * Joins two people as partners and records the union.
 *
 * `isActive: false` is a past partnership, which the pedigree draws differently
 * and which is how step-relations arise.
 */
function addUnion(
  builder: Builder,
  a: AbstractPerson,
  b: AbstractPerson,
): Union {
  const union: Union = {
    a: a.id,
    b: b.id,
    isActive: !chance(builder.rng, builder.demography.partnershipEndedRate),
  };
  builder.unions.push(union);
  return union;
}

/**
 * Records a child of a couple, assigning each parent the gamete their sex
 * implies. Variants (donation, surrogacy, adoption) are layered on afterwards
 * so this stays a single, always-correct base case.
 */
function addChildOf(
  builder: Builder,
  mother: AbstractPerson,
  father: AbstractPerson,
  generation: number,
  prefix: string,
): AbstractPerson {
  const child = addPerson(builder, prefix, generation, randomSex(builder));
  builder.parents.set(child.id, [
    { parent: mother.id, relationshipType: 'biological', gameteRole: 'egg' },
    { parent: father.id, relationshipType: 'biological', gameteRole: 'sperm' },
  ]);
  return child;
}

/**
 * A couple in the given generation, created as founders. Used wherever the
 * pedigree needs a pair whose own parents are outside its scope.
 */
function addFounderCouple(
  builder: Builder,
  generation: number,
  prefix: string,
): { mother: AbstractPerson; father: AbstractPerson } {
  const mother = addPerson(builder, `${prefix}-f`, generation, 'female', {
    isFounder: true,
  });
  const father = addPerson(builder, `${prefix}-m`, generation, 'male', {
    isFounder: true,
  });
  addUnion(builder, mother, father);
  return { mother, father };
}

/**
 * Gives someone a founder couple as parents. Used to satisfy the depth-2 reach
 * of `requireChildrenContributors` without drawing a whole sibship.
 */
function addFounderParentsFor(builder: Builder, person: AbstractPerson): void {
  if (builder.parents.has(person.id)) return;
  const { mother, father } = addFounderCouple(
    builder,
    person.generation - 1,
    `anc${person.id}`,
  );
  builder.parents.set(person.id, [
    { parent: mother.id, relationshipType: 'biological', gameteRole: 'egg' },
    { parent: father.id, relationshipType: 'biological', gameteRole: 'sperm' },
  ]);
}

/** A partner who married in, so has no parents on the pedigree. */
function addPartnerFor(
  builder: Builder,
  person: AbstractPerson,
): AbstractPerson {
  const partner = addPerson(
    builder,
    'partner',
    person.generation,
    person.sex === 'female' ? 'male' : 'female',
    { isFounder: true },
  );
  addUnion(builder, person, partner);
  return partner;
}

/**
 * One parent's branch: that parent's own parents (a pair of ego's
 * grandparents), then that parent's siblings — ego's aunts and uncles — and
 * each of their children, who are ego's cousins.
 *
 * The sibship of the parent is drawn size-biased, because the parent is a known
 * *child* of the grandparents. Each aunt or uncle's own children are drawn
 * unconditioned, because nothing yet says they had any.
 */
function addAscendingBranch(
  builder: Builder,
  parent: AbstractPerson,
  prefix: string,
): void {
  const { mother: grandmother, father: grandfather } = addFounderCouple(
    builder,
    parent.generation - 1,
    `${prefix}gp`,
  );

  builder.parents.set(parent.id, [
    {
      parent: grandmother.id,
      relationshipType: 'biological',
      gameteRole: 'egg',
    },
    {
      parent: grandfather.id,
      relationshipType: 'biological',
      gameteRole: 'sperm',
    },
  ]);

  // The grandparents' childbearing, so the grandparental cohort's fertility.
  const sibshipSize = sampleSibshipOfKnownChild(
    builder.rng,
    builder.demography,
    'grandparental',
  );
  for (let index = 1; index < sibshipSize; index++) {
    const auntOrUncle = addChildOf(
      builder,
      grandmother,
      grandfather,
      parent.generation,
      `${prefix}auncle`,
    );

    if (!chance(builder.rng, builder.demography.partnershipRate)) continue;
    const partner = addPartnerFor(builder, auntOrUncle);

    // The aunt's or uncle's own childbearing — ego's parents' cohort.
    const cousinCount = sampleSibshipUnconditioned(
      builder.rng,
      builder.demography,
      'parental',
    );
    const mother = auntOrUncle.sex === 'female' ? auntOrUncle : partner;
    const father = auntOrUncle.sex === 'female' ? partner : auntOrUncle;
    for (let cousin = 0; cousin < cousinCount; cousin++) {
      addChildOf(builder, mother, father, 0, `${prefix}cousin`);
    }
  }
}

/**
 * Trims the pedigree to `maxPeople` by dropping whole cousin branches from the
 * end, leaving ego's own line and every ancestor intact.
 *
 * A bound is needed because feasibility counts worst cases, and an unbounded
 * draw off a fertility distribution has a long tail: the mean is around 29
 * people but the maximum is several times that. Cousins are what the tail is
 * made of, and they are the least load-bearing part of the structure, so the
 * shape survives the trim.
 */
function trimTo(
  pedigree: AbstractPedigree,
  maxPeople: number,
  boundaries: PedigreeBoundaries,
  alsoProtect: ReadonlySet<string> = new Set(),
): AbstractPedigree {
  if (pedigree.people.length <= maxPeople) return pedigree;

  const keep = new Set<string>();

  const keepAncestors = (id: string): void => {
    for (const link of pedigree.parents.get(id) ?? []) {
      if (keep.has(link.parent)) continue;
      keep.add(link.parent);
      keepAncestors(link.parent);
    }
  };

  // Only what the configured boundaries actually reach is protected. Emitting a
  // pedigree the interface would refuse to finalize is the one thing the
  // generator must never do — but protecting ego's whole ancestry and descent
  // unconditionally made a small configured cap impossible to honour, and
  // feasibility then had to budget for a pedigree far larger than the protocol
  // asked for.
  //
  for (const id of alsoProtect) keep.add(id);

  // Always: ego, and the parents the hard minimum requires.
  keep.add(pedigree.egoId);
  for (const link of pedigree.parents.get(pedigree.egoId) ?? []) {
    keep.add(link.parent);
  }

  // `requireGrandparents` reaches one generation past ego's genetic parents.
  if (boundaries.requireGrandparents === 'required') {
    for (const link of pedigree.parents.get(pedigree.egoId) ?? []) {
      for (const above of pedigree.parents.get(link.parent) ?? []) {
        keep.add(above.parent);
      }
    }
  }

  // `requireChildrenContributors` reaches each child's other parent and that
  // parent's own two generations.
  if (boundaries.requireChildrenContributors === 'required') {
    for (const [childId, links] of pedigree.parents) {
      if (!links.some((link) => link.parent === pedigree.egoId)) continue;
      keep.add(childId);
      for (const link of links) {
        keep.add(link.parent);
        keepAncestors(link.parent);
      }
    }
  }

  // A kept child keeps every one of its parents: `parents` is filtered to
  // entries whose links are all kept, so dropping one contributor would
  // silently strip the child's whole parentage and leave it a founder with
  // none. The closure therefore has to be part of deciding who fits, not a pass
  // afterwards — running it last overshoots the cap by whatever it drags in.
  const withParents = (seed: string): Set<string> => {
    const closed = new Set<string>([seed]);
    const queue = [seed];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const link of pedigree.parents.get(id) ?? []) {
        if (closed.has(link.parent)) continue;
        closed.add(link.parent);
        queue.push(link.parent);
      }
    }
    return closed;
  };

  // Snapshotted deliberately: the loop adds to `keep` as it goes.
  const protectedSeeds = Array.from(keep);
  for (const id of protectedSeeds) {
    for (const ancestor of withParents(id)) keep.add(ancestor);
  }

  // Protected first, then everyone else in order — each taken only if their
  // whole parent chain still fits.
  for (const person of pedigree.people) {
    if (keep.has(person.id)) continue;
    const needed = withParents(person.id);
    let size = keep.size;
    for (const id of needed) if (!keep.has(id)) size += 1;
    if (size > maxPeople) continue;
    for (const id of needed) keep.add(id);
  }

  const people = pedigree.people.filter((person) => keep.has(person.id));
  const parents = new Map(
    [...pedigree.parents].filter(
      ([child, links]) =>
        keep.has(child) && links.every((link) => keep.has(link.parent)),
    ),
  );
  const unions = pedigree.unions.filter(
    (union) => keep.has(union.a) && keep.has(union.b),
  );

  return {
    egoId: pedigree.egoId,
    people,
    parents,
    unions,
    noChildrenAffirmed: pedigree.noChildrenAffirmed,
  };
}

/**
 * Applies the same trim to an existing pedigree, in place.
 *
 * Needed after the variant pass, which appends donors and carriers: feasibility
 * budgets `maxPeople`, and a run that exceeded it could exhaust a `unique`
 * variable the analysis had already passed.
 */
export function trimPedigreeTo(
  pedigree: AbstractPedigree,
  maxPeople: number,
  boundaries: PedigreeBoundaries,
  alsoProtect: ReadonlySet<string> = new Set(),
): void {
  const trimmed = trimTo(pedigree, maxPeople, boundaries, alsoProtect);
  if (trimmed === pedigree) return;
  pedigree.people = trimmed.people;
  pedigree.parents = trimmed.parents;
  pedigree.unions = trimmed.unions;
}

export function buildKinshipSkeleton(
  rng: Rng,
  demography: PedigreeDemography,
  options: KinshipOptions = {},
): AbstractPedigree {
  const boundaries = options.boundaries ?? {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  };
  // Only a `required` boundary blocks the interface from finalizing, so only a
  // `required` boundary forces the generator's hand. Anything looser is left to
  // the population rate, which is what produces pedigrees that legitimately
  // stop short of the grandparents.
  const mustHaveGrandparents = boundaries.requireGrandparents === 'required';
  const mustHaveChildContributors =
    boundaries.requireChildrenContributors === 'required';
  const builder: Builder = {
    rng,
    demography,
    people: [],
    parents: new Map(),
    unions: [],
    counter: { value: 0 },
  };

  const ego = addPerson(builder, 'ego', 0, randomSex(builder), { isEgo: true });

  // How ego was conceived, settled before anything is built rather than layered
  // on afterwards. The variant pass deliberately leaves ego and their ancestors
  // alone — adopting ego after the fact would strand a whole ascending branch
  // hanging off nobody — so a non-standard proband has to be decided here, and
  // the branches that would no longer be ego's genetic line simply are not
  // drawn.
  //
  // A `required` grandparents boundary rules the donor cases out: the boundary
  // asks every genetic parent of ego for two genetic parents of their own, and
  // a donor's parents are never recorded. Adoption still qualifies — it leaves
  // ego no genetic parents at all, so the boundary is satisfied vacuously.
  const egoOptions = mustHaveGrandparents
    ? (['adopted', 'surrogate'] as const)
    : (['adopted', 'donorEgg', 'donorSperm', 'surrogate'] as const);
  const egoConception = chance(rng, demography.egoNonStandardConceptionRate)
    ? egoOptions[rng.randomInt(0, egoOptions.length - 1)]!
    : 'standard';

  // Ego's parents. Created as a couple first so ego's own parentage, and every
  // sibling's, hangs off one union.
  const mother = addPerson(builder, 'mother', -1, 'female');
  const father = addPerson(builder, 'father', -1, 'male');
  addUnion(builder, mother, father);

  if (egoConception === 'adopted') {
    // No genetic parentage at all, which is exactly why an adopted proband
    // satisfies `requireGrandparents` vacuously and inherits nothing.
    builder.parents.set(ego.id, [
      { parent: mother.id, relationshipType: 'adoptive' },
      { parent: father.id, relationshipType: 'adoptive' },
    ]);
  } else if (egoConception === 'donorEgg') {
    const donor = addPerson(builder, 'egg-donor', -1, 'female', {
      isFounder: true,
    });
    builder.parents.set(ego.id, [
      { parent: donor.id, relationshipType: 'donor', gameteRole: 'egg' },
      {
        parent: father.id,
        relationshipType: 'biological',
        gameteRole: 'sperm',
      },
      {
        parent: mother.id,
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
    ]);
  } else if (egoConception === 'donorSperm') {
    const donor = addPerson(builder, 'sperm-donor', -1, 'male', {
      isFounder: true,
    });
    builder.parents.set(ego.id, [
      { parent: mother.id, relationshipType: 'biological', gameteRole: 'egg' },
      { parent: donor.id, relationshipType: 'donor', gameteRole: 'sperm' },
    ]);
  } else if (egoConception === 'surrogate') {
    const carrier = addPerson(builder, 'carrier', -1, 'female', {
      isFounder: true,
    });
    builder.parents.set(ego.id, [
      { parent: mother.id, relationshipType: 'biological', gameteRole: 'egg' },
      {
        parent: father.id,
        relationshipType: 'biological',
        gameteRole: 'sperm',
      },
      {
        parent: carrier.id,
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
    ]);
  } else {
    builder.parents.set(ego.id, [
      { parent: mother.id, relationshipType: 'biological', gameteRole: 'egg' },
      {
        parent: father.id,
        relationshipType: 'biological',
        gameteRole: 'sperm',
      },
    ]);
  }

  // Ego's siblings. Size-biased, because ego is a known child rather than a
  // known parent, and drawn from ego's parents' cohort.
  const sibshipSize = sampleSibshipOfKnownChild(rng, demography, 'parental');
  for (let index = 1; index < sibshipSize; index++) {
    addChildOf(builder, mother, father, 0, 'sibling');
  }

  // Grandparents are drawn where the stage requires them, and otherwise only as
  // often as they are actually recorded. `requireGrandparents` defaults to
  // `off`, and a participant frequently cannot name all four — a donor's
  // parents are essentially never known, and an adoptee's genetic line is
  // usually absent entirely. Always drawing them would make every generated
  // pedigree deeper than the interface asks for and hide the shallow cases.
  //
  // Each side is decided independently: knowing one set of grandparents and not
  // the other is commonplace.
  const recordGrandparents = () =>
    mustHaveGrandparents || chance(rng, demography.grandparentsRecordedRate);

  // Only where that parent is still a genetic parent of ego. An adopted or
  // donor-conceived proband's line runs through somebody who is not on the
  // pedigree, so drawing the branch would attach a family to nobody.
  const contributesToEgo = (id: string) =>
    (builder.parents.get(ego.id) ?? []).some(
      (link) =>
        link.parent === id &&
        (link.relationshipType === 'biological' ||
          link.relationshipType === 'donor'),
    );

  if (contributesToEgo(mother.id) && recordGrandparents()) {
    addAscendingBranch(builder, mother, 'm');
  }
  if (contributesToEgo(father.id) && recordGrandparents()) {
    addAscendingBranch(builder, father, 'p');
  }

  // Ego's own partner and children. A `required` children-contributors boundary
  // forces the issue: either ego has children whose other parent is recorded
  // deeply enough, or ego affirms having none. Affirming is the cheaper of the
  // two and is what a participant without children does.
  let noChildrenAffirmed = false;
  const wantsChildren =
    chance(rng, demography.partnershipRate) &&
    chance(rng, demography.egoHasChildrenRate);

  if (wantsChildren) {
    const partner = addPartnerFor(builder, ego);
    const childCount = sampleSibshipOfKnownParent(rng, demography);
    const childMother = ego.sex === 'female' ? ego : partner;
    const childFather = ego.sex === 'female' ? partner : ego;
    for (let index = 0; index < childCount; index++) {
      addChildOf(builder, childMother, childFather, 1, 'child');
    }

    // The boundary reaches two generations past the co-parent, so satisfying it
    // means recording the co-parent's parents and their parents in turn.
    if (mustHaveChildContributors && childCount > 0) {
      addAscendingBranch(builder, partner, 'cp');
      for (const link of builder.parents.get(partner.id) ?? []) {
        const grandparent = builder.people.find((p) => p.id === link.parent);
        if (grandparent) addFounderParentsFor(builder, grandparent);
      }
    } else if (mustHaveChildContributors) {
      noChildrenAffirmed = true;
    }
  } else if (mustHaveChildContributors) {
    noChildrenAffirmed = true;
  }

  // A person is a founder when the pedigree records no parents for them. That
  // is settled here rather than at creation, because whether a branch ascends
  // is decided after the people on it exist: ego's mother is not a founder by
  // nature, only by whether her own parents were recorded.
  for (const person of builder.people) {
    person.isFounder = !builder.parents.has(person.id);
  }

  // Grow toward the requested floor by recording branches the draw left out,
  // rather than by inventing people the structure does not call for. Bounded by
  // the number of people who can still take an ascent.
  if (options.minPeople !== undefined) {
    let grew = true;
    while (builder.people.length < options.minPeople && grew) {
      grew = false;
      // Snapshotted deliberately: `addFounderParentsFor` appends as it goes.
      const candidates = Array.from(builder.people);
      for (const person of candidates) {
        if (builder.people.length >= options.minPeople) break;
        if (builder.parents.has(person.id)) continue;
        if (person.generation <= -2) continue;
        addFounderParentsFor(builder, person);
        grew = true;
      }
    }
  }

  const pedigree: AbstractPedigree = {
    egoId: ego.id,
    people: builder.people,
    parents: builder.parents,
    unions: builder.unions,
    noChildrenAffirmed,
  };

  return options.maxPeople === undefined
    ? pedigree
    : trimTo(pedigree, options.maxPeople, boundaries);
}
