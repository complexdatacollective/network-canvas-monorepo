import { describe, expect, it } from 'vitest';

import type { GeneticGraph } from '../genetics/geneticGraph';
import type { Status } from '../genetics/status';
import { computeHighlight, edgeKey } from '../highlight';

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
