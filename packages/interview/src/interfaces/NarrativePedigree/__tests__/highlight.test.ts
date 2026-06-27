import { describe, expect, it } from 'vitest';

import type { GeneticGraph } from '../genetics/geneticGraph';
import type { Status } from '../genetics/status';
import { computeContributors, computeHighlight, edgeKey } from '../highlight';

/**
 * Builds a minimal GeneticGraph stub from a parent→child adjacency list.
 *
 * Edges are directed parent→child (same convention as the real graph).
 */
function buildStubGraph(
  nodeIdList: string[],
  edges: [parentId: string, childId: string][],
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
      sex: 'unknown' as const,
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
    descendants,
    ancestors,
    propagate,
    nodeIds: () => nodeIdList,
  };
}

/**
 * Fixture:
 *
 *   GP (grandparent, affected)
 *    |
 *   PAR (parent, carrier)
 *    |
 *   FOCAL (focal child, unknown)
 *
 *   UNRELATED (no genetic link to FOCAL's lineage, unknown for all diseases)
 */
const FOCAL = 'focal';
const PAR = 'parent';
const GP = 'grandparent';
const UNRELATED = 'unrelated';

const graph = buildStubGraph(
  [GP, PAR, FOCAL, UNRELATED],
  [
    [GP, PAR],
    [PAR, FOCAL],
  ],
);

const DISEASE_A = 'disease-a';

// GP is affected; PAR is carrier; FOCAL and UNRELATED have no entry (unknown).
const statusesByDisease: Map<string, Map<string, Status>> = new Map([
  [
    DISEASE_A,
    new Map<string, Status>([
      [GP, 'affected'],
      [PAR, 'obligateCarrier'],
    ]),
  ],
]);

describe('edgeKey', () => {
  it('produces a stable parentId->childId string', () => {
    expect(edgeKey('a', 'b')).toBe('a->b');
    expect(edgeKey('x', 'y')).toBe('x->y');
  });
});

describe('computeHighlight', () => {
  const focalIds = new Set([FOCAL]);
  const result = computeHighlight(focalIds, graph, statusesByDisease);

  it('always includes focal ids in the node set', () => {
    expect(result.nodes.has(FOCAL)).toBe(true);
  });

  it('includes affected grandparent in the node set', () => {
    expect(result.nodes.has(GP)).toBe(true);
  });

  it('includes carrier parent in the node set', () => {
    expect(result.nodes.has(PAR)).toBe(true);
  });

  it('excludes unrelated node that has unknown status for all diseases', () => {
    expect(result.nodes.has(UNRELATED)).toBe(false);
  });

  it('includes the GP->PAR edge', () => {
    expect(result.edges.has(edgeKey(GP, PAR))).toBe(true);
  });

  it('includes the PAR->FOCAL edge', () => {
    expect(result.edges.has(edgeKey(PAR, FOCAL))).toBe(true);
  });

  it('does not include any edge to/from the unrelated node', () => {
    for (const key of result.edges) {
      expect(key).not.toContain(UNRELATED);
    }
  });
});

describe('computeHighlight — unknown-status lineage relative excluded', () => {
  /**
   * FOCAL has a grandparent (GP2) and a parent (UNKNOWN_PAR) where the
   * parent's status is unknown for all shown diseases.
   * Only GP2 is affected; UNKNOWN_PAR should be excluded.
   */
  const GP2 = 'gp2';
  const UNKNOWN_PAR = 'unknown-par';
  const FOCAL2 = 'focal2';

  const graph2 = buildStubGraph(
    [GP2, UNKNOWN_PAR, FOCAL2],
    [
      [GP2, UNKNOWN_PAR],
      [UNKNOWN_PAR, FOCAL2],
    ],
  );

  const statusesByDisease2: Map<string, Map<string, Status>> = new Map([
    [
      DISEASE_A,
      new Map<string, Status>([
        [GP2, 'affected'],
        // UNKNOWN_PAR intentionally absent → unknown
      ]),
    ],
  ]);

  const result2 = computeHighlight(
    new Set([FOCAL2]),
    graph2,
    statusesByDisease2,
  );

  it('includes focal id', () => {
    expect(result2.nodes.has(FOCAL2)).toBe(true);
  });

  it('includes affected grandparent', () => {
    expect(result2.nodes.has(GP2)).toBe(true);
  });

  it('excludes the intermediate unknown-status parent', () => {
    expect(result2.nodes.has(UNKNOWN_PAR)).toBe(false);
  });

  it('does not include an edge through the unknown parent', () => {
    expect(result2.edges.has(edgeKey(GP2, UNKNOWN_PAR))).toBe(false);
    expect(result2.edges.has(edgeKey(UNKNOWN_PAR, FOCAL2))).toBe(false);
  });
});

describe('computeHighlight — focal id is always included even if unknown', () => {
  const LONE = 'lone';
  const graph3 = buildStubGraph([LONE], []);
  const emptyStatuses: Map<string, Map<string, Status>> = new Map();

  const result3 = computeHighlight(new Set([LONE]), graph3, emptyStatuses);

  it('includes the focal node even with no disease statuses', () => {
    expect(result3.nodes.has(LONE)).toBe(true);
  });

  it('has no edges when no lineage is present', () => {
    expect(result3.edges.size).toBe(0);
  });
});

describe('computeHighlight — multiple focal ids', () => {
  /**
   * FOCAL_A and FOCAL_B are unrelated. GP_A has affected status;
   * GP_B has no status. Both focal ids are included; GP_A is included
   * because it is an ancestor of FOCAL_A with non-unknown status.
   */
  const FOCAL_A = 'focal-a';
  const GP_A = 'gp-a';
  const FOCAL_B = 'focal-b';
  const GP_B = 'gp-b';

  const graph4 = buildStubGraph(
    [GP_A, FOCAL_A, GP_B, FOCAL_B],
    [
      [GP_A, FOCAL_A],
      [GP_B, FOCAL_B],
    ],
  );

  const statusesByDisease4: Map<string, Map<string, Status>> = new Map([
    [DISEASE_A, new Map<string, Status>([[GP_A, 'affected']])],
  ]);

  const result4 = computeHighlight(
    new Set([FOCAL_A, FOCAL_B]),
    graph4,
    statusesByDisease4,
  );

  it('includes both focal nodes', () => {
    expect(result4.nodes.has(FOCAL_A)).toBe(true);
    expect(result4.nodes.has(FOCAL_B)).toBe(true);
  });

  it('includes the affected grandparent of FOCAL_A', () => {
    expect(result4.nodes.has(GP_A)).toBe(true);
  });

  it('excludes GP_B which has no non-unknown status', () => {
    expect(result4.nodes.has(GP_B)).toBe(false);
  });

  it('includes the GP_A->FOCAL_A edge', () => {
    expect(result4.edges.has(edgeKey(GP_A, FOCAL_A))).toBe(true);
  });

  it('does not include GP_B->FOCAL_B edge', () => {
    expect(result4.edges.has(edgeKey(GP_B, FOCAL_B))).toBe(false);
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

  const result = computeContributors(null, graphAll, statusAll);

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

  const result = computeContributors(FOCAL_DOM, graphDom, statusDom);

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

  const result = computeContributors(FOCAL_C, graphC, statusC);

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

  const result = computeContributors(FOCAL_AR, graphAR, statusAR);

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

  const result = computeContributors(CHILD_PS, graphPS, statusPS);

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

  const result = computeContributors(FOCAL_F, graphF, statusF);

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
