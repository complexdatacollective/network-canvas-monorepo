import { describe, expect, it } from 'vitest';

import type { InheritancePattern } from '@codaco/shared-consts';

import type { GeneticGraph } from '../genetics/geneticGraph';
import type { Status } from '../genetics/status';
import {
  computeContributors,
  type DiseaseContributors,
  edgeKey,
} from '../highlight';

type Sex = 'female' | 'male' | 'unknown';

/** Resolver backed by a sex map; unmapped nodes resolve to `unknown`. */
function resolveSexFrom(sexMap?: Map<string, Sex>): (id: string) => Sex {
  return (id) => sexMap?.get(id) ?? 'unknown';
}

/**
 * Wraps one or more per-disease status maps as the `DiseaseContributors[]` the
 * pattern-aware walk consumes. Defaults to an autosomal-dominant pattern, under
 * which (and with `unknown` sex) the walk follows every on-lineage parent — the
 * behaviour the original sex-agnostic tests were written against.
 */
function asDiseases(
  statusesByDisease: Map<string, Map<string, Status>>,
  pattern: InheritancePattern = 'autosomalDominant',
): DiseaseContributors[] {
  return [...statusesByDisease.values()].map((statuses) => ({
    pattern,
    statuses,
  }));
}

const RESOLVE_UNKNOWN = resolveSexFrom();

/**
 * Builds a minimal GeneticGraph stub from a parent→child adjacency list.
 *
 * Edges are directed parent→child (same convention as the real graph). An
 * optional `sexMap` annotates parents with a resolved biological sex for the
 * sex-linked transmission rules; unmapped nodes are `unknown`.
 */
function buildStubGraph(
  nodeIdList: string[],
  edges: [parentId: string, childId: string][],
  sexMap?: Map<string, Sex>,
): GeneticGraph {
  const parentMap = new Map<string, string[]>();
  const childMap = new Map<string, string[]>();

  for (const id of nodeIdList) {
    parentMap.set(id, []);
    childMap.set(id, []);
  }

  for (const [parentId, childId] of edges) {
    parentMap.get(childId)?.push(parentId);
    childMap.get(parentId)?.push(childId);
  }

  function parentsOf(id: string) {
    return (parentMap.get(id) ?? []).map((pid) => ({
      id: pid,
      sex: sexMap?.get(pid) ?? ('unknown' as const),
    }));
  }

  function childrenOf(id: string): string[] {
    return childMap.get(id) ?? [];
  }

  function propagate(
    seedIds: string[],
    step: (id: string) => string[],
    visited: Set<string> = new Set<string>(),
  ): Set<string> {
    const queue = [...seedIds];
    for (const s of seedIds) {
      visited.add(s);
    }
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const next of step(current)) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return visited;
  }

  function descendants(id: string): Set<string> {
    const v = new Set<string>();
    propagate([id], childrenOf, v);
    v.delete(id);
    return v;
  }

  function ancestors(id: string): Set<string> {
    const v = new Set<string>();
    propagate([id], (nid) => parentsOf(nid).map((p) => p.id), v);
    v.delete(id);
    return v;
  }

  return {
    parentsOf,
    childrenOf,
    fullSiblingsOf: () => [],
    halfSiblingsOf: () => [],
    maternalHalfSiblingsOf: () => [],
    descendants,
    ancestors,
    propagate,
    nodeIds: () => nodeIdList,
  };
}

const DISEASE_A = 'disease-a';

describe('edgeKey', () => {
  it('produces a stable parentId->childId string', () => {
    expect(edgeKey('a', 'b')).toBe('a->b');
    expect(edgeKey('x', 'y')).toBe('x->y');
  });
});

// ─── computeContributors tests ────────────────────────────────────────────────

describe('computeContributors — (a) focal=null highlights everything', () => {
  /**
   * When focalId is null, the entire pedigree is lit — no dimming.
   *
   * Graph:
   *   GP → PAR → CHILD
   *             ↓
   *           GRANDCHILD
   */
  const GP_ALL = 'gp-all';
  const PAR_ALL = 'par-all';
  const CHILD_ALL = 'child-all';
  const GRANDCHILD_ALL = 'gc-all';

  const graphAll = buildStubGraph(
    [GP_ALL, PAR_ALL, CHILD_ALL, GRANDCHILD_ALL],
    [
      [GP_ALL, PAR_ALL],
      [PAR_ALL, CHILD_ALL],
      [CHILD_ALL, GRANDCHILD_ALL],
    ],
  );

  const statusAll: Map<string, Map<string, Status>> = new Map([
    [DISEASE_A, new Map<string, Status>([[GP_ALL, 'affected']])],
  ]);

  const result = computeContributors(
    null,
    graphAll,
    asDiseases(statusAll),
    RESOLVE_UNKNOWN,
  );

  it('includes every node in the graph', () => {
    expect(result.nodes.has(GP_ALL)).toBe(true);
    expect(result.nodes.has(PAR_ALL)).toBe(true);
    expect(result.nodes.has(CHILD_ALL)).toBe(true);
    expect(result.nodes.has(GRANDCHILD_ALL)).toBe(true);
  });

  it('result.nodes size equals total node count', () => {
    expect(result.nodes.size).toBe(4);
  });

  it('includes all directed edges', () => {
    expect(result.edges.has(edgeKey(GP_ALL, PAR_ALL))).toBe(true);
    expect(result.edges.has(edgeKey(PAR_ALL, CHILD_ALL))).toBe(true);
    expect(result.edges.has(edgeKey(CHILD_ALL, GRANDCHILD_ALL))).toBe(true);
  });

  it('result.edges size equals total edge count', () => {
    expect(result.edges.size).toBe(3);
  });
});

describe('computeContributors — (b) dominant grandparent→parent→focal: ancestors lit, descendants dimmed', () => {
  /**
   * Autosomal dominant pedigree. Affected grandparent transmitted to affected
   * parent who transmitted to the focal child. The focal also has a child
   * (FOCAL_CHILD) and a sibling (SIBLING). Only the ancestors with
   * non-unknown status are lit; descendants and unrelated are dimmed.
   *
   * Graph:
   *   GP_DOM (affected) → PAR_DOM (affected) → FOCAL_DOM → FOCAL_CHILD
   *                                          ↘ SIBLING (unknown)
   */
  const GP_DOM = 'gp-dom';
  const PAR_DOM = 'par-dom';
  const FOCAL_DOM = 'focal-dom';
  const FOCAL_CHILD = 'fc-dom';
  const SIBLING = 'sib-dom';

  const graphDom = buildStubGraph(
    [GP_DOM, PAR_DOM, FOCAL_DOM, FOCAL_CHILD, SIBLING],
    [
      [GP_DOM, PAR_DOM],
      [PAR_DOM, FOCAL_DOM],
      [PAR_DOM, SIBLING],
      [FOCAL_DOM, FOCAL_CHILD],
    ],
  );

  const statusDom: Map<string, Map<string, Status>> = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [GP_DOM, 'affected'],
        [PAR_DOM, 'affected'],
        // FOCAL_DOM, FOCAL_CHILD, SIBLING have unknown status
      ]),
    ],
  ]);

  const result = computeContributors(
    FOCAL_DOM,
    graphDom,
    asDiseases(statusDom),
    RESOLVE_UNKNOWN,
  );

  it('includes the focal node', () => {
    expect(result.nodes.has(FOCAL_DOM)).toBe(true);
  });

  it('includes the transmitting parent (affected)', () => {
    expect(result.nodes.has(PAR_DOM)).toBe(true);
  });

  it('includes the transmitting grandparent (affected)', () => {
    expect(result.nodes.has(GP_DOM)).toBe(true);
  });

  it('does NOT include the focal child (descendant)', () => {
    expect(result.nodes.has(FOCAL_CHILD)).toBe(false);
  });

  it('does NOT include the sibling (same-generation, not an ancestor)', () => {
    expect(result.nodes.has(SIBLING)).toBe(false);
  });

  it('includes the GP_DOM→PAR_DOM edge', () => {
    expect(result.edges.has(edgeKey(GP_DOM, PAR_DOM))).toBe(true);
  });

  it('includes the PAR_DOM→FOCAL_DOM edge', () => {
    expect(result.edges.has(edgeKey(PAR_DOM, FOCAL_DOM))).toBe(true);
  });

  it('does NOT include the FOCAL_DOM→FOCAL_CHILD edge', () => {
    expect(result.edges.has(edgeKey(FOCAL_DOM, FOCAL_CHILD))).toBe(false);
  });
});

describe('computeContributors — (c) non-transmitting (unknown-status) parent branch NOT highlighted', () => {
  /**
   * The focal has two parents. One parent has obligateCarrier status
   * (transmitting) and one parent has unknown status (non-transmitting).
   * The non-transmitting parent and their ancestors must NOT be highlighted.
   *
   * Graph:
   *   GP_T (affected) → PAR_T (obligateCarrier) ──┐
   *                                               FOCAL_C
   *   GP_NT (unknown) → PAR_NT (unknown) ─────────┘
   */
  const GP_T = 'gp-t';
  const PAR_T = 'par-t';
  const FOCAL_C = 'focal-c';
  const GP_NT = 'gp-nt';
  const PAR_NT = 'par-nt';

  const graphC = buildStubGraph(
    [GP_T, PAR_T, FOCAL_C, GP_NT, PAR_NT],
    [
      [GP_T, PAR_T],
      [PAR_T, FOCAL_C],
      [GP_NT, PAR_NT],
      [PAR_NT, FOCAL_C],
    ],
  );

  const statusC: Map<string, Map<string, Status>> = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [GP_T, 'affected'],
        [PAR_T, 'obligateCarrier'],
        // PAR_NT and GP_NT are absent (unknown)
      ]),
    ],
  ]);

  const result = computeContributors(
    FOCAL_C,
    graphC,
    asDiseases(statusC),
    RESOLVE_UNKNOWN,
  );

  it('includes the focal node', () => {
    expect(result.nodes.has(FOCAL_C)).toBe(true);
  });

  it('includes the transmitting parent', () => {
    expect(result.nodes.has(PAR_T)).toBe(true);
  });

  it('includes the transmitting grandparent', () => {
    expect(result.nodes.has(GP_T)).toBe(true);
  });

  it('does NOT include the unknown-status parent (non-transmitting)', () => {
    expect(result.nodes.has(PAR_NT)).toBe(false);
  });

  it('does NOT include the grandparent of the non-transmitting branch', () => {
    expect(result.nodes.has(GP_NT)).toBe(false);
  });

  it('does NOT include an edge through the non-transmitting parent', () => {
    expect(result.edges.has(edgeKey(PAR_NT, FOCAL_C))).toBe(false);
    expect(result.edges.has(edgeKey(GP_NT, PAR_NT))).toBe(false);
  });
});

describe('computeContributors — (d) recessive: both carrier parent lineages highlighted', () => {
  /**
   * Autosomal recessive. FOCAL is affected (homozygous). Both parents are
   * obligate carriers, each inheriting an allele from their own affected
   * parent. Both full lineages must be lit.
   *
   * Graph:
   *   GP_MAT (affected) → PAR_MAT (obligateCarrier) ──┐
   *                                                  FOCAL_AR
   *   GP_PAT (affected) → PAR_PAT (obligateCarrier) ──┘
   */
  const GP_MAT = 'gp-mat';
  const PAR_MAT = 'par-mat';
  const FOCAL_AR = 'focal-ar';
  const GP_PAT = 'gp-pat';
  const PAR_PAT = 'par-pat';

  const graphAR = buildStubGraph(
    [GP_MAT, PAR_MAT, FOCAL_AR, GP_PAT, PAR_PAT],
    [
      [GP_MAT, PAR_MAT],
      [PAR_MAT, FOCAL_AR],
      [GP_PAT, PAR_PAT],
      [PAR_PAT, FOCAL_AR],
    ],
  );

  const statusAR: Map<string, Map<string, Status>> = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [GP_MAT, 'affected'],
        [PAR_MAT, 'obligateCarrier'],
        [GP_PAT, 'affected'],
        [PAR_PAT, 'obligateCarrier'],
      ]),
    ],
  ]);

  const result = computeContributors(
    FOCAL_AR,
    graphAR,
    asDiseases(statusAR, 'autosomalRecessive'),
    RESOLVE_UNKNOWN,
  );

  it('includes the focal node', () => {
    expect(result.nodes.has(FOCAL_AR)).toBe(true);
  });

  it('includes maternal carrier parent', () => {
    expect(result.nodes.has(PAR_MAT)).toBe(true);
  });

  it('includes maternal affected grandparent', () => {
    expect(result.nodes.has(GP_MAT)).toBe(true);
  });

  it('includes paternal carrier parent', () => {
    expect(result.nodes.has(PAR_PAT)).toBe(true);
  });

  it('includes paternal affected grandparent', () => {
    expect(result.nodes.has(GP_PAT)).toBe(true);
  });

  it('includes edges for both lineages', () => {
    expect(result.edges.has(edgeKey(GP_MAT, PAR_MAT))).toBe(true);
    expect(result.edges.has(edgeKey(PAR_MAT, FOCAL_AR))).toBe(true);
    expect(result.edges.has(edgeKey(GP_PAT, PAR_PAT))).toBe(true);
    expect(result.edges.has(edgeKey(PAR_PAT, FOCAL_AR))).toBe(true);
  });

  it('total highlighted nodes is 5 (both full lineages)', () => {
    expect(result.nodes.size).toBe(5);
  });
});

describe('computeContributors — (e) partner-side: disease via father-in-law → partner → focal', () => {
  /**
   * The disease enters from the partner side. The focal child (CHILD_PS) has
   * TWO biological parents: PARTNER — who inherited the allele from their own
   * father (FATHER_IN_LAW, affected) — and EGO (the focal's other parent), whose
   * whole maternal/paternal side is unaffected. Selecting CHILD_PS as focal must
   * light up the partner-side transmission line and DIM ego's entire side,
   * because ego (and ego's parents) do not contribute to CHILD_PS's inheritance.
   *
   * This genuinely exercises the transmitting-ancestor gate at the focal's OWN
   * parent: EGO is a direct parent of CHILD_PS but has `unknown` status, so the
   * walk must stop there and never reach ego's parents.
   *
   * Graph:
   *   FATHER_IN_LAW (affected) → PARTNER (obligateCarrier) ──┐
   *                                                          CHILD_PS (focal)
   *   FOCAL_GM (unknown) → EGO (unknown) ────────────────────┘
   *   FOCAL_GF (unknown) → EGO
   */
  const FATHER_IN_LAW = 'fil';
  const PARTNER = 'partner';
  const CHILD_PS = 'child-ps';
  const EGO = 'ego-ps';
  const FOCAL_GM = 'focal-gm';
  const FOCAL_GF = 'focal-gf';

  // CHILD_PS (focal) has two parents: PARTNER (disease side) and EGO (own side).
  // EGO is unknown-status, so the gate must dim EGO and EGO's parents.
  const graphPS = buildStubGraph(
    [FATHER_IN_LAW, PARTNER, CHILD_PS, EGO, FOCAL_GM, FOCAL_GF],
    [
      [FATHER_IN_LAW, PARTNER],
      [PARTNER, CHILD_PS],
      [EGO, CHILD_PS],
      [FOCAL_GM, EGO],
      [FOCAL_GF, EGO],
    ],
  );

  const statusPS: Map<string, Map<string, Status>> = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [FATHER_IN_LAW, 'affected'],
        [PARTNER, 'obligateCarrier'],
        // CHILD_PS, EGO, FOCAL_GM, FOCAL_GF all unknown
      ]),
    ],
  ]);

  const result = computeContributors(
    CHILD_PS,
    graphPS,
    asDiseases(statusPS),
    RESOLVE_UNKNOWN,
  );

  it('includes the focal node (child-ps)', () => {
    expect(result.nodes.has(CHILD_PS)).toBe(true);
  });

  it('includes the transmitting partner', () => {
    expect(result.nodes.has(PARTNER)).toBe(true);
  });

  it('includes the father-in-law (affected ancestor on partner side)', () => {
    expect(result.nodes.has(FATHER_IN_LAW)).toBe(true);
  });

  it("does NOT include ego — the focal's own parent — because ego is unknown-status (gate stops here)", () => {
    expect(result.nodes.has(EGO)).toBe(false);
  });

  it("does NOT include ego's parents (unreachable past the gated ego)", () => {
    expect(result.nodes.has(FOCAL_GM)).toBe(false);
    expect(result.nodes.has(FOCAL_GF)).toBe(false);
  });

  it('includes the FATHER_IN_LAW→PARTNER edge', () => {
    expect(result.edges.has(edgeKey(FATHER_IN_LAW, PARTNER))).toBe(true);
  });

  it('includes the PARTNER→CHILD_PS edge', () => {
    expect(result.edges.has(edgeKey(PARTNER, CHILD_PS))).toBe(true);
  });

  it('does NOT include the EGO→CHILD_PS edge (ego is dimmed)', () => {
    expect(result.edges.has(edgeKey(EGO, CHILD_PS))).toBe(false);
  });
});

describe('computeContributors — (f) union across two diseases', () => {
  /**
   * Two diseases with non-overlapping contributor lineages. The focal has
   * two parents, each transmitting a different disease. The contributor
   * set must be the UNION: all ancestors from both lineages are lit.
   *
   * Disease A: GP_A2 (affected) → PAR_A (obligateCarrier) → FOCAL_F
   * Disease B: GP_B2 (affected) → PAR_B (obligateCarrier) → FOCAL_F
   */
  const DISEASE_B = 'disease-b';
  const GP_A2 = 'gp-a2';
  const PAR_A = 'par-a';
  const FOCAL_F = 'focal-f';
  const GP_B2 = 'gp-b2';
  const PAR_B = 'par-b';

  const graphF = buildStubGraph(
    [GP_A2, PAR_A, FOCAL_F, GP_B2, PAR_B],
    [
      [GP_A2, PAR_A],
      [PAR_A, FOCAL_F],
      [GP_B2, PAR_B],
      [PAR_B, FOCAL_F],
    ],
  );

  // Each disease is tracked independently; PAR_A only transmits disease A,
  // PAR_B only transmits disease B.
  const statusF: Map<string, Map<string, Status>> = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [GP_A2, 'affected'],
        [PAR_A, 'obligateCarrier'],
        // PAR_B is unknown for disease A
      ]),
    ],
    [
      DISEASE_B,
      new Map<string, Status>([
        [GP_B2, 'affected'],
        [PAR_B, 'obligateCarrier'],
        // PAR_A is unknown for disease B
      ]),
    ],
  ]);

  const result = computeContributors(
    FOCAL_F,
    graphF,
    asDiseases(statusF),
    RESOLVE_UNKNOWN,
  );

  it('includes focal node', () => {
    expect(result.nodes.has(FOCAL_F)).toBe(true);
  });

  it('includes PAR_A (transmits disease A)', () => {
    expect(result.nodes.has(PAR_A)).toBe(true);
  });

  it('includes GP_A2 (affected for disease A)', () => {
    expect(result.nodes.has(GP_A2)).toBe(true);
  });

  it('includes PAR_B (transmits disease B)', () => {
    expect(result.nodes.has(PAR_B)).toBe(true);
  });

  it('includes GP_B2 (affected for disease B)', () => {
    expect(result.nodes.has(GP_B2)).toBe(true);
  });

  it('includes all five nodes (union of both lineages)', () => {
    expect(result.nodes.size).toBe(5);
  });

  it('includes edges from both lineages', () => {
    expect(result.edges.has(edgeKey(GP_A2, PAR_A))).toBe(true);
    expect(result.edges.has(edgeKey(PAR_A, FOCAL_F))).toBe(true);
    expect(result.edges.has(edgeKey(GP_B2, PAR_B))).toBe(true);
    expect(result.edges.has(edgeKey(PAR_B, FOCAL_F))).toBe(true);
  });
});

describe('computeContributors — (g) X-linked recessive: a son inherits via his mother only', () => {
  /**
   * An affected son's single X came from his mother; his father gave him the Y.
   * Even though the father is AFFECTED (non-`unknown`), the father→son edge
   * cannot carry the X, so the father's line must dim.
   *
   *   FATHER (affected male) ─┐
   *                           SON (focal, male, affected)
   *   MOTHER (carrier female)─┘
   */
  const FATHER = 'father-g';
  const MOTHER = 'mother-g';
  const SON = 'son-g';

  const graph = buildStubGraph(
    [FATHER, MOTHER, SON],
    [
      [FATHER, SON],
      [MOTHER, SON],
    ],
    new Map<string, Sex>([
      [FATHER, 'male'],
      [MOTHER, 'female'],
      [SON, 'male'],
    ]),
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [SON, 'affected'],
        [FATHER, 'affected'],
        [MOTHER, 'obligateCarrier'],
      ]),
    ],
  ]);

  const result = computeContributors(
    SON,
    graph,
    asDiseases(statuses, 'xLinkedRecessive'),
    resolveSexFrom(
      new Map<string, Sex>([
        [FATHER, 'male'],
        [MOTHER, 'female'],
        [SON, 'male'],
      ]),
    ),
  );

  it('includes the carrier mother (maternal X source)', () => {
    expect(result.nodes.has(MOTHER)).toBe(true);
  });

  it('does NOT include the affected father (a son gets the Y, not the X)', () => {
    expect(result.nodes.has(FATHER)).toBe(false);
  });
});

describe('computeContributors — (h) X-linked recessive: affected father is the source, the at-risk maternal grandmother dims', () => {
  /**
   * The "Rose" case. A son's haemophilia traces up his maternal line: he got his
   * X from his carrier mother (ego), and ego is an OBLIGATE carrier specifically
   * because HER father is affected — so ego's disease X came from that affected
   * grandfather, NOT from ego's own mother. The maternal grandmother carries only
   * an inferred at-risk prior and is NOT on the transmission path, so she dims.
   *
   *   GREAT_GM (obligate-carrier female) → GF (affected male) ─┐
   *                                                            EGO (obligate-carrier female) ─┐
   *                                        GM (at-risk-carrier female) ────────────────────────┘   SON (focal, male, affected)
   *                                                            PARTNER (male, unknown) ───────────┘
   */
  const GREAT_GM = 'great-gm-h'; // affected grandfather's carrier mother
  const GF = 'gf-h'; // affected maternal grandfather (the true source)
  const GM = 'gm-h'; // at-risk-carrier maternal grandmother (incidental — must dim)
  const EGO = 'ego-h'; // obligate-carrier mother
  const PARTNER = 'partner-h';
  const SON = 'son-h';

  const sex = new Map<string, Sex>([
    [GREAT_GM, 'female'],
    [GF, 'male'],
    [GM, 'female'],
    [EGO, 'female'],
    [PARTNER, 'male'],
    [SON, 'male'],
  ]);

  const graph = buildStubGraph(
    [GREAT_GM, GF, GM, EGO, PARTNER, SON],
    [
      [GREAT_GM, GF],
      [GF, EGO],
      [GM, EGO],
      [EGO, SON],
      [PARTNER, SON],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [SON, 'affected'],
        [EGO, 'obligateCarrier'],
        [GF, 'affected'],
        [GREAT_GM, 'obligateCarrier'],
        [GM, 'atRiskCarrier'],
        // PARTNER is unknown
      ]),
    ],
  ]);

  const result = computeContributors(
    SON,
    graph,
    asDiseases(statuses, 'xLinkedRecessive'),
    resolveSexFrom(sex),
  );

  it('includes the carrier mother (the son’s maternal X source)', () => {
    expect(result.nodes.has(EGO)).toBe(true);
  });

  it('includes the affected maternal grandfather (ego’s certain X source)', () => {
    expect(result.nodes.has(GF)).toBe(true);
  });

  it('includes the grandfather’s own carrier mother (continuing his maternal line)', () => {
    expect(result.nodes.has(GREAT_GM)).toBe(true);
  });

  it('does NOT include the at-risk maternal grandmother (incidental prior, not the source)', () => {
    expect(result.nodes.has(GM)).toBe(false);
  });

  it('does NOT include the unaffected partner (father of the son)', () => {
    expect(result.nodes.has(PARTNER)).toBe(false);
  });

  it('does NOT light the grandmother→ego edge', () => {
    expect(result.edges.has(edgeKey(GM, EGO))).toBe(false);
  });
});

describe('computeContributors — (i) X-linked recessive: a homozygous-affected daughter has BOTH parents as sources', () => {
  /**
   * A homozygous-affected daughter (status `affected`) took a disease X from each
   * parent — an affected father AND a carrier mother — so both lineages light.
   *
   *   FATHER (affected male) ──┐
   *                            DAUGHTER (focal, female, affected)
   *   MOTHER (carrier female) ─┘
   */
  const FATHER = 'father-i';
  const MOTHER = 'mother-i';
  const DAUGHTER = 'daughter-i';

  const sex = new Map<string, Sex>([
    [FATHER, 'male'],
    [MOTHER, 'female'],
    [DAUGHTER, 'female'],
  ]);

  const graph = buildStubGraph(
    [FATHER, MOTHER, DAUGHTER],
    [
      [FATHER, DAUGHTER],
      [MOTHER, DAUGHTER],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [DAUGHTER, 'affected'],
        [FATHER, 'affected'],
        [MOTHER, 'obligateCarrier'],
      ]),
    ],
  ]);

  const result = computeContributors(
    DAUGHTER,
    graph,
    asDiseases(statuses, 'xLinkedRecessive'),
    resolveSexFrom(sex),
  );

  it('includes the affected father', () => {
    expect(result.nodes.has(FATHER)).toBe(true);
  });

  it('includes the carrier mother', () => {
    expect(result.nodes.has(MOTHER)).toBe(true);
  });
});

describe('computeContributors — (j) mitochondrial: inheritance follows the maternal line only', () => {
  /**
   * mtDNA passes mother→all children; a father transmits nothing. The affected
   * father therefore dims even though he is nominated affected.
   *
   *   GM (at-risk female) → MOTHER (affected female) ─┐
   *                                                   CHILD (focal)
   *               FATHER (affected male) ─────────────┘
   */
  const GM = 'gm-j';
  const MOTHER = 'mother-j';
  const FATHER = 'father-j';
  const CHILD = 'child-j';

  const sex = new Map<string, Sex>([
    [GM, 'female'],
    [MOTHER, 'female'],
    [FATHER, 'male'],
    [CHILD, 'male'],
  ]);

  const graph = buildStubGraph(
    [GM, MOTHER, FATHER, CHILD],
    [
      [GM, MOTHER],
      [MOTHER, CHILD],
      [FATHER, CHILD],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [CHILD, 'atRiskAffected'],
        [MOTHER, 'affected'],
        [GM, 'atRiskAffected'],
        [FATHER, 'affected'],
      ]),
    ],
  ]);

  const result = computeContributors(
    CHILD,
    graph,
    asDiseases(statuses, 'mitochondrial'),
    resolveSexFrom(sex),
  );

  it('includes the affected mother (maternal mt source)', () => {
    expect(result.nodes.has(MOTHER)).toBe(true);
  });

  it('includes the maternal grandmother (continuing the maternal line)', () => {
    expect(result.nodes.has(GM)).toBe(true);
  });

  it('does NOT include the affected father (fathers do not transmit mtDNA)', () => {
    expect(result.nodes.has(FATHER)).toBe(false);
  });
});

describe('computeContributors — (k) Y-linked: inheritance follows the paternal male line only', () => {
  /**
   * The Y passes father→son in an unbroken male line; a mother transmits nothing.
   *
   *   GF (obligate-affected male) → FATHER (affected male) ─┐
   *                                                         SON (focal, male)
   *                              MOTHER (female, unknown) ──┘
   */
  const GF = 'gf-k';
  const FATHER = 'father-k';
  const MOTHER = 'mother-k';
  const SON = 'son-k';

  const sex = new Map<string, Sex>([
    [GF, 'male'],
    [FATHER, 'male'],
    [MOTHER, 'female'],
    [SON, 'male'],
  ]);

  const graph = buildStubGraph(
    [GF, FATHER, MOTHER, SON],
    [
      [GF, FATHER],
      [FATHER, SON],
      [MOTHER, SON],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [SON, 'affected'],
        [FATHER, 'affected'],
        [GF, 'obligateAffected'],
        // MOTHER is unknown
      ]),
    ],
  ]);

  const result = computeContributors(
    SON,
    graph,
    asDiseases(statuses, 'yLinked'),
    resolveSexFrom(sex),
  );

  it('includes the affected father (paternal Y source)', () => {
    expect(result.nodes.has(FATHER)).toBe(true);
  });

  it('includes the grandfather (continuing the male line)', () => {
    expect(result.nodes.has(GF)).toBe(true);
  });

  it('does NOT include the mother (mothers do not transmit the Y)', () => {
    expect(result.nodes.has(MOTHER)).toBe(false);
  });
});

describe('computeContributors — (l) X-linked recessive: an AFFECTED (homozygous) mother is kept as a co-source', () => {
  /**
   * A daughter of an affected father AND an AFFECTED (homozygous) mother is
   * herself homozygous-affected — even when participant under-nomination leaves
   * her labelled only `obligateCarrier`. The affected mother transmits a disease
   * X with certainty, so she (and her maternal line) must NOT be dropped in
   * favour of the affected father alone.
   *
   *   FATHER (affected male) ──┐
   *                            DAUGHTER (focal, female, obligateCarrier by under-nomination)
   *   MOTHER (affected female)─┘
   */
  const FATHER = 'father-l';
  const MOTHER = 'mother-l';
  const DAUGHTER = 'daughter-l';

  const sex = new Map<string, Sex>([
    [FATHER, 'male'],
    [MOTHER, 'female'],
    [DAUGHTER, 'female'],
  ]);

  const graph = buildStubGraph(
    [FATHER, MOTHER, DAUGHTER],
    [
      [FATHER, DAUGHTER],
      [MOTHER, DAUGHTER],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        // Engine labels a daughter of an affected male obligateCarrier unless she
        // was independently nominated affected.
        [DAUGHTER, 'obligateCarrier'],
        [FATHER, 'affected'],
        [MOTHER, 'affected'],
      ]),
    ],
  ]);

  const result = computeContributors(
    DAUGHTER,
    graph,
    asDiseases(statuses, 'xLinkedRecessive'),
    resolveSexFrom(sex),
  );

  it('includes the affected father', () => {
    expect(result.nodes.has(FATHER)).toBe(true);
  });

  it('includes the affected mother (a certain disease-X transmitter, not dropped)', () => {
    expect(result.nodes.has(MOTHER)).toBe(true);
  });
});

describe('computeContributors — (m) X-linked DOMINANT: an affected father never excludes an affected mother', () => {
  /**
   * Under X-linked dominant one affected X suffices, so an affected heterozygous
   * daughter’s disease X could come from EITHER affected parent. The paternal
   * collapse (valid only for recessive) must not apply — both lines light.
   *
   *   FATHER (affected male) ──┐
   *                            DAUGHTER (focal, female, obligateAffected)
   *   MOTHER (affected female)─┘
   */
  const FATHER = 'father-m';
  const MOTHER = 'mother-m';
  const DAUGHTER = 'daughter-m';

  const sex = new Map<string, Sex>([
    [FATHER, 'male'],
    [MOTHER, 'female'],
    [DAUGHTER, 'female'],
  ]);

  const graph = buildStubGraph(
    [FATHER, MOTHER, DAUGHTER],
    [
      [FATHER, DAUGHTER],
      [MOTHER, DAUGHTER],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [DAUGHTER, 'obligateAffected'],
        [FATHER, 'affected'],
        [MOTHER, 'affected'],
      ]),
    ],
  ]);

  const result = computeContributors(
    DAUGHTER,
    graph,
    asDiseases(statuses, 'xLinkedDominant'),
    resolveSexFrom(sex),
  );

  it('includes the affected father', () => {
    expect(result.nodes.has(FATHER)).toBe(true);
  });

  it('includes the affected mother (dominant: an affected father is not the sole source)', () => {
    expect(result.nodes.has(MOTHER)).toBe(true);
  });
});

describe('computeContributors — (n) Y-linked: a FEMALE focal climbs nothing (she received no Y)', () => {
  /**
   * A Y-linked trait reaches only males, father→son. Even if a female is
   * (degenerately) nominated affected, she received no Y from her father, so the
   * walk must not climb her paternal male line.
   *
   *   GF (obligate-affected male) → DAD (affected male) → FOCAL (female, nominated affected)
   */
  const GF = 'gf-n';
  const DAD = 'dad-n';
  const FOCAL = 'focal-n';

  const sex = new Map<string, Sex>([
    [GF, 'male'],
    [DAD, 'male'],
    [FOCAL, 'female'],
  ]);

  const graph = buildStubGraph(
    [GF, DAD, FOCAL],
    [
      [GF, DAD],
      [DAD, FOCAL],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [FOCAL, 'affected'],
        [DAD, 'affected'],
        [GF, 'obligateAffected'],
      ]),
    ],
  ]);

  const result = computeContributors(
    FOCAL,
    graph,
    asDiseases(statuses, 'yLinked'),
    resolveSexFrom(sex),
  );

  it('includes only the focal herself', () => {
    expect(result.nodes.has(FOCAL)).toBe(true);
    expect(result.nodes.size).toBe(1);
  });

  it('does NOT climb the paternal male line of a female focal', () => {
    expect(result.nodes.has(DAD)).toBe(false);
    expect(result.nodes.has(GF)).toBe(false);
  });
});

describe('computeContributors — (o) edges follow transmission, not just both-endpoints (consanguineous X-linked)', () => {
  /**
   * A homozygous-affected daughter descends from a consanguineous union: her
   * father and her mother are both children of the same affected grandfather GF.
   * GF is a contributor via the maternal path (father→daughter X to the mother),
   * and the father is a contributor via the paternal path — so BOTH GF and the
   * father are highlighted nodes and GF is the father's genetic parent. But GF
   * gave his SON (the father) the Y, not an X, so the GF→FATHER edge must NOT
   * light, even though both endpoints are contributors.
   *
   *   GF (affected male) ─┬─→ FATHER (affected male) ──┐   FGM (carrier female) → FATHER
   *                       └─→ MOTHER (affected female) ┐│
   *                                                    ││ DAUGHTER (focal, female, affected)
   *                    MGM (female, unknown) → MOTHER  ┘┘
   */
  const GF = 'gf-o';
  const FGM = 'fgm-o';
  const MGM = 'mgm-o';
  const FATHER = 'father-o';
  const MOTHER = 'mother-o';
  const DAUGHTER = 'daughter-o';

  const sex = new Map<string, Sex>([
    [GF, 'male'],
    [FGM, 'female'],
    [MGM, 'female'],
    [FATHER, 'male'],
    [MOTHER, 'female'],
    [DAUGHTER, 'female'],
  ]);

  const graph = buildStubGraph(
    [GF, FGM, MGM, FATHER, MOTHER, DAUGHTER],
    [
      [GF, FATHER],
      [FGM, FATHER],
      [GF, MOTHER],
      [MGM, MOTHER],
      [FATHER, DAUGHTER],
      [MOTHER, DAUGHTER],
    ],
    sex,
  );

  const statuses = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [DAUGHTER, 'affected'],
        [FATHER, 'affected'],
        [MOTHER, 'affected'],
        [GF, 'affected'],
        [FGM, 'obligateCarrier'],
        // MGM is unknown
      ]),
    ],
  ]);

  const result = computeContributors(
    DAUGHTER,
    graph,
    asDiseases(statuses, 'xLinkedRecessive'),
    resolveSexFrom(sex),
  );

  it('includes the father and the grandfather as contributor nodes', () => {
    expect(result.nodes.has(FATHER)).toBe(true);
    expect(result.nodes.has(GF)).toBe(true);
  });

  it('does NOT light the GF→FATHER edge (a son gets his father’s Y, not an X)', () => {
    expect(result.edges.has(edgeKey(GF, FATHER))).toBe(false);
  });

  it('DOES light the GF→MOTHER edge (father→daughter transmits the X)', () => {
    expect(result.edges.has(edgeKey(GF, MOTHER))).toBe(true);
  });

  it('reaches the father’s disease-X source through his carrier mother (FGM)', () => {
    expect(result.nodes.has(FGM)).toBe(true);
    expect(result.edges.has(edgeKey(FGM, FATHER))).toBe(true);
  });
});
