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

/** How strictly a boundary is enforced. Mirrors the stage's own config. */
export type BoundarySeverity = 'required' | 'recommended' | 'off';

export type PedigreeBoundaries = {
  requireGrandparents: BoundarySeverity;
  requireChildrenContributors: BoundarySeverity;
};

export type KinshipOptions = {
  boundaries?: PedigreeBoundaries;
  maxPeople?: number;
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
): AbstractPedigree {
  if (pedigree.people.length <= maxPeople) return pedigree;

  const keep = new Set(pedigree.people.slice(0, maxPeople).map((p) => p.id));

  const keepAncestors = (id: string): void => {
    for (const link of pedigree.parents.get(id) ?? []) {
      if (keep.has(link.parent)) continue;
      keep.add(link.parent);
      keepAncestors(link.parent);
    }
  };

  // Everything a completeness boundary can reach is protected from the trim.
  // Ego and their ancestors, obviously — but also ego's children and each
  // child's other parent, whose own two generations `requireChildrenContributors`
  // reaches. Trimming those produced a pedigree the interface would refuse to
  // finalize, which is the one thing the generator must never emit.
  keep.add(pedigree.egoId);
  keepAncestors(pedigree.egoId);

  for (const [childId, links] of pedigree.parents) {
    if (!links.some((link) => link.parent === pedigree.egoId)) continue;
    keep.add(childId);
    for (const link of links) {
      keep.add(link.parent);
      keepAncestors(link.parent);
    }
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

  // Ego's parents. Created as a couple first so ego's own parentage, and every
  // sibling's, hangs off one union.
  const mother = addPerson(builder, 'mother', -1, 'female');
  const father = addPerson(builder, 'father', -1, 'male');
  addUnion(builder, mother, father);
  builder.parents.set(ego.id, [
    { parent: mother.id, relationshipType: 'biological', gameteRole: 'egg' },
    { parent: father.id, relationshipType: 'biological', gameteRole: 'sperm' },
  ]);

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

  if (recordGrandparents()) addAscendingBranch(builder, mother, 'm');
  if (recordGrandparents()) addAscendingBranch(builder, father, 'p');

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

  const pedigree: AbstractPedigree = {
    egoId: ego.id,
    people: builder.people,
    parents: builder.parents,
    unions: builder.unions,
    noChildrenAffirmed,
  };

  return options.maxPeople === undefined
    ? pedigree
    : trimTo(pedigree, options.maxPeople);
}
