import type {
  ParentConnection,
  PartnerConnection,
  PedigreeInput,
  Relation,
} from '../types';

const sp = (parentIndex: number): ParentConnection => ({
  parentIndex,
  edgeType: 'biological',
});

/**
 * Nuclear family: 2 parents (parent1=0, parent2=1) + 3 children (2,3,4)
 */
export const nuclearFamily: PedigreeInput = {
  id: ['parent1', 'parent2', 'child1', 'child2', 'child3'],
  parents: [[], [], [sp(0), sp(1)], [sp(0), sp(1)], [sp(0), sp(1)]],
};

/**
 * 3-generation pedigree:
 * Gen 0: gp1(0), gp2(1)
 * Gen 1: parent1(2), parent2(3)
 * Gen 2: child(4)
 */
export const threeGeneration: PedigreeInput = {
  id: ['gp1', 'gp2', 'parent1', 'parent2', 'child'],
  parents: [[], [], [sp(0), sp(1)], [], [sp(2), sp(3)]],
};

/**
 * Multiple marriages: parent1(0) partners with partner1(1) and partner2(2)
 * child1(3) from first partnership, child2(4) from second
 */
export const multipleMarriages: PedigreeInput = {
  id: ['parent1', 'partner1', 'partner2', 'child1', 'child2'],
  parents: [[], [], [], [sp(0), sp(1)], [sp(0), sp(2)]],
  relation: [
    { id1: 0, id2: 1, code: 4 },
    { id1: 0, id2: 2, code: 4 },
  ] satisfies Relation[],
  partners: [
    { partnerIndex1: 0, partnerIndex2: 1, isActive: false },
    { partnerIndex1: 0, partnerIndex2: 2, isActive: true },
  ] satisfies PartnerConnection[],
};

/**
 * Twins: parents(0,1) with MZ twin pair (2,3) and a singleton (4)
 */
export const twinFamily: PedigreeInput = {
  id: ['parent1', 'parent2', 'twin1', 'twin2', 'singleton'],
  parents: [[], [], [sp(0), sp(1)], [sp(0), sp(1)], [sp(0), sp(1)]],
  relation: [{ id1: 2, id2: 3, code: 1 }],
};

/**
 * Wide pedigree: 2 parents + 5 children
 */
export const wideFamily: PedigreeInput = {
  id: ['p1', 'p2', 'c1', 'c2', 'c3', 'c4', 'c5'],
  parents: [
    [],
    [],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
  ],
};

// --- Inclusive family fixtures ---

/**
 * Same-sex parents: two women with a child
 */
export const sameSeParents: PedigreeInput = {
  id: ['parent1', 'parent2', 'child'],
  parents: [[], [], [sp(0), sp(1)]],
};

/**
 * Three co-parents
 */
export const threeCoParents: PedigreeInput = {
  id: ['parent1', 'parent2', 'parent3', 'child'],
  parents: [
    [],
    [],
    [],
    [
      { parentIndex: 0, edgeType: 'biological' },
      { parentIndex: 1, edgeType: 'biological' },
      { parentIndex: 2, edgeType: 'biological' },
    ],
  ],
};

/**
 * Surrogacy family: two fathers + surrogate mother
 */
export const surrogacyFamily: PedigreeInput = {
  id: ['parent1', 'parent2', 'surrogate', 'child'],
  parents: [
    [],
    [],
    [],
    [
      { parentIndex: 0, edgeType: 'biological' },
      { parentIndex: 1, edgeType: 'biological' },
      { parentIndex: 2, edgeType: 'surrogate' },
    ],
  ],
};

/**
 * Surrogacy family with the intended parents ALSO shown as a sibling pair, so
 * the couple that the surrogate contributes to is embedded in a sibship block
 * rather than being its own block. gp1(0)+gp2(1) have two children: dad(2) and
 * uncle(3). dad is partnered to mom(4); the surrogate(5) carries their child(6).
 * The surrogate must still be seated beside the dad+mom couple (not drifted to
 * the far end of the dad/uncle sibship block).
 */
export const surrogacyWithSibling: PedigreeInput = {
  id: ['gp1', 'gp2', 'dad', 'uncle', 'mom', 'surrogate', 'child'],
  parents: [
    [],
    [],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
    [],
    [],
    [
      { parentIndex: 2, edgeType: 'biological' },
      { parentIndex: 4, edgeType: 'biological' },
      { parentIndex: 5, edgeType: 'surrogate' },
    ],
  ],
  partners: [{ partnerIndex1: 2, partnerIndex2: 4, isActive: true }],
  relation: [{ id1: 2, id2: 4, code: 4 }],
};

/**
 * Two intermarrying sibships whose union descends asymmetrically — a distilled
 * form of the comprehensive NarrativePedigree gen-II/III structure.
 *
 *   gg1(0) ⚭ gg2(1)
 *      |         |
 *   sibA(2)   sibB(3)                         (siblings)
 *   ⚭ spA(4)  ⚭ spB(5)
 *      |         |
 *   cA(6) child of sibA+spA        extraA(8) child of sibA+spA (pulls the sibship)
 *   cB(7) child of sibB+spB
 *      |
 *   cA(6) ⚭ cB(7)                             (consanguineous cousins)
 *      |
 *   gc(9)
 *
 * Generation II is a SINGLE sibship block [sibA, spA, sibB, spB]. Because sibA
 * has an EXTRA child (extraA) besides cousinA, the barycentre of sibA's family
 * pulls one way while the cousin union pulls the couple the other way, freezing
 * the block in an orientation that crosses the descent to the cousin union. The
 * barycentric sweeps only reorder whole blocks, so only a block-reversal
 * (reflection) reaches the mirror orientation that removes the crossing.
 */
export const twoSibshipIntermarriage: PedigreeInput = {
  id: [
    'gg1',
    'gg2',
    'sibA',
    'sibB',
    'spA',
    'spB',
    'cousinA',
    'cousinB',
    'extraA',
    'gc',
  ],
  parents: [
    [],
    [],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
    [],
    [],
    [sp(2), sp(4)],
    [sp(3), sp(5)],
    [sp(2), sp(4)],
    [sp(6), sp(7)],
  ],
  partners: [
    { partnerIndex1: 2, partnerIndex2: 4, isActive: true },
    { partnerIndex1: 3, partnerIndex2: 5, isActive: true },
    { partnerIndex1: 6, partnerIndex2: 7, isActive: true },
  ],
  relation: [
    { id1: 2, id2: 4, code: 4 },
    { id1: 3, id2: 5, code: 4 },
    { id1: 6, id2: 7, code: 4 },
  ],
};

/**
 * Single parent: one parent, one child
 */
export const singleParent: PedigreeInput = {
  id: ['parent', 'child'],
  parents: [[], [sp(0)]],
};

/**
 * Blended family with bio-parent: custodial parents + non-custodial bio-parent
 */
export const blendedFamily: PedigreeInput = {
  id: ['custodialMom', 'stepDad', 'bioDad', 'child'],
  parents: [
    [],
    [],
    [],
    [
      { parentIndex: 0, edgeType: 'biological' },
      { parentIndex: 1, edgeType: 'social' },
      { parentIndex: 2, edgeType: 'biological' },
    ],
  ],
};

/**
 * Consanguineous union: two first cousins who are partners.
 *
 *   gp1(0) ⚭ gp2(1)
 *      |        |
 *   parentA(2)  parentB(3)        (siblings; both children of gp1+gp2)
 *      |            |
 *   ego(4) ⚭ cousin(5)            (first cousins, partnered)
 *            |
 *        child(6)
 *
 * ego and cousin share the grandparent couple {0,1}, so the partner line
 * between them is consanguineous (group === 2). parentA and parentB are
 * partnered to outside spouses in other fixtures; here ego/cousin each have a
 * single recorded parent for minimality, which is enough to share ancestor 0.
 */
export const consanguineousUnion: PedigreeInput = {
  id: ['gp1', 'gp2', 'parentA', 'parentB', 'ego', 'cousin', 'child'],
  parents: [
    [],
    [],
    [sp(0), sp(1)],
    [sp(0), sp(1)],
    [sp(2)],
    [sp(3)],
    [sp(4), sp(5)],
  ],
  relation: [
    { id1: 0, id2: 1, code: 4 },
    { id1: 4, id2: 5, code: 4 },
  ],
  partners: [
    { partnerIndex1: 0, partnerIndex2: 1, isActive: true },
    { partnerIndex1: 4, partnerIndex2: 5, isActive: true },
  ],
};

/**
 * Non-consanguineous couple: two unrelated partners with a child.
 *
 *   personA(0) ⚭ personB(1)
 *            |
 *        child(2)
 *
 * personA and personB share no ancestors, so their partner line is a single
 * line (group === 1).
 */
export const unrelatedCouple: PedigreeInput = {
  id: ['personA', 'personB', 'child'],
  parents: [[], [], [sp(0), sp(1)]],
  relation: [{ id1: 0, id2: 1, code: 4 }],
  partners: [{ partnerIndex1: 0, partnerIndex2: 1, isActive: true }],
};

/**
 * Cross-family pedigree: two grandparent couples whose children marry.
 *
 *   gpA1(0) + gpA2(1)      gpB1(2) + gpB2(3)
 *         |                       |
 *       childA(4) ---- childB(5)
 *              |
 *          grandchild(6)
 *
 * This structure triggers the per-layer normalization bug when the
 * downward centering creates negative positions on the child layer.
 */
export const crossFamily: PedigreeInput = {
  id: ['gpA1', 'gpA2', 'gpB1', 'gpB2', 'childA', 'childB', 'grandchild'],
  parents: [[], [], [], [], [sp(0), sp(1)], [sp(2), sp(3)], [sp(4), sp(5)]],
  relation: [
    { id1: 0, id2: 1, code: 4 },
    { id1: 2, id2: 3, code: 4 },
    { id1: 4, id2: 5, code: 4 },
  ],
  partners: [
    { partnerIndex1: 0, partnerIndex2: 1, isActive: true },
    { partnerIndex1: 2, partnerIndex2: 3, isActive: true },
    { partnerIndex1: 4, partnerIndex2: 5, isActive: true },
  ],
};

/**
 * A remarried parent who ALSO has a sibling shown. Grandparents (0,1) have two
 * children Mom(2) and Aunt(3); Mom is partnered to Dad(5, ex) and StepDad(6),
 * and Ego(4) descends from Mom+Dad. Mom is a multi-marriage anchor AND a member
 * of a sibship, so she must sit BETWEEN her two spouses — both marriage lines
 * must stay contiguous.
 */
export const remarriedParentWithSibling: PedigreeInput = {
  id: ['gp1', 'gp2', 'mom', 'aunt', 'ego', 'dad', 'stepDad'],
  parents: [[], [], [sp(0), sp(1)], [sp(0), sp(1)], [sp(2), sp(5)], [], []],
  partners: [
    { partnerIndex1: 2, partnerIndex2: 5, isActive: false },
    { partnerIndex1: 2, partnerIndex2: 6, isActive: true },
  ],
};

/**
 * A child with a couple (mom + dad) PLUS TWO auxiliary contributors — an egg
 * donor and a surrogate. Both auxiliary parents must be seated adjacent to the
 * couple (one on each side) so their donor/surrogate connectors stay short.
 */
export const dualAuxiliary: PedigreeInput = {
  id: ['mom', 'dad', 'donor', 'surrogate', 'child'],
  parents: [
    [],
    [],
    [],
    [],
    [
      { parentIndex: 0, edgeType: 'biological' },
      { parentIndex: 1, edgeType: 'biological' },
      { parentIndex: 2, edgeType: 'donor' },
      { parentIndex: 3, edgeType: 'surrogate' },
    ],
  ],
  partners: [{ partnerIndex1: 0, partnerIndex2: 1, isActive: true }],
  relation: [{ id1: 0, id2: 1, code: 4 }],
};
