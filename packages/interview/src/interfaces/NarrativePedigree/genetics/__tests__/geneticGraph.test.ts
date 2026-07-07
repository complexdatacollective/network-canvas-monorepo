import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { buildGeneticGraph } from '../geneticGraph';
import { computeAutosomalRecessive } from '../patterns/autosomal';

const RELATIONSHIP_TYPE_VAR = 'relationshipType';

function makeNode(id: string): NcNode {
  return {
    [entityPrimaryKeyProperty]: id,
    type: 'person',
    [entityAttributesProperty]: {},
  };
}

function makeGeneticEdge(from: string, to: string): NcEdge {
  return {
    [entityPrimaryKeyProperty]: `${from}->${to}`,
    type: 'family',
    from,
    to,
    [entityAttributesProperty]: {
      [RELATIONSHIP_TYPE_VAR]: ['biological'],
    },
  };
}

const config = { relationshipTypeVariable: RELATIONSHIP_TYPE_VAR };

// Sex stubs for the fixture
function stubResolveSex(
  sexMap: Record<string, 'female' | 'male' | 'unknown'>,
): (id: string) => 'female' | 'male' | 'unknown' {
  return (id) => sexMap[id] ?? 'unknown';
}

/**
 * Fixture layout:
 *
 *   mother (female) --- father (male)
 *         |                  |
 *         +------ego---------+
 *         |                  |
 *         +---fullSib--------+
 *         |
 *       halfSib  (only shares mother)
 *
 * Edge direction: parent → child (from = parent, to = child)
 */
const egoId = 'ego';
const motherId = 'mother';
const fatherId = 'father';
const fullSibId = 'fullSib';
const halfSibId = 'halfSib'; // shares only mother

const fixtureNodes: NcNode[] = [
  makeNode(egoId),
  makeNode(motherId),
  makeNode(fatherId),
  makeNode(fullSibId),
  makeNode(halfSibId),
];

const fixtureEdges: NcEdge[] = [
  makeGeneticEdge(motherId, egoId),
  makeGeneticEdge(fatherId, egoId),
  makeGeneticEdge(motherId, fullSibId),
  makeGeneticEdge(fatherId, fullSibId),
  makeGeneticEdge(motherId, halfSibId),
];

const fixtureSexMap: Record<string, 'female' | 'male' | 'unknown'> = {
  mother: 'female',
  father: 'male',
  ego: 'unknown',
  fullSib: 'unknown',
  halfSib: 'unknown',
};

const resolveSex = stubResolveSex(fixtureSexMap);

describe('buildGeneticGraph — basic fixture', () => {
  const graph = buildGeneticGraph(
    fixtureNodes,
    fixtureEdges,
    config,
    resolveSex,
  );

  it('parentsOf(ego) returns both parents with correct sexes', () => {
    const parents = graph.parentsOf(egoId);
    expect(parents).toHaveLength(2);
    const parentById = Object.fromEntries(parents.map((p) => [p.id, p.sex]));
    expect(parentById[motherId]).toBe('female');
    expect(parentById[fatherId]).toBe('male');
  });

  it('parentsOf returns empty array for a node with no parents', () => {
    expect(graph.parentsOf(motherId)).toHaveLength(0);
  });

  it('childrenOf(mother) includes ego, fullSib, and halfSib', () => {
    const children = graph.childrenOf(motherId);
    expect(children).toContain(egoId);
    expect(children).toContain(fullSibId);
    expect(children).toContain(halfSibId);
  });

  it('childrenOf(father) includes ego and fullSib but not halfSib', () => {
    const children = graph.childrenOf(fatherId);
    expect(children).toContain(egoId);
    expect(children).toContain(fullSibId);
    expect(children).not.toContain(halfSibId);
  });

  it('fullSiblingsOf(ego) includes fullSib and excludes halfSib and ego', () => {
    const fullSibs = graph.fullSiblingsOf(egoId);
    expect(fullSibs).toContain(fullSibId);
    expect(fullSibs).not.toContain(halfSibId);
    expect(fullSibs).not.toContain(egoId);
  });

  it('halfSiblingsOf(ego) includes halfSib and excludes fullSib and ego', () => {
    const halfSibs = graph.halfSiblingsOf(egoId);
    expect(halfSibs).toContain(halfSibId);
    expect(halfSibs).not.toContain(fullSibId);
    expect(halfSibs).not.toContain(egoId);
  });

  it('ancestors(ego) includes mother and father', () => {
    const ancs = graph.ancestors(egoId);
    expect(ancs.has(motherId)).toBe(true);
    expect(ancs.has(fatherId)).toBe(true);
  });

  it('descendants(mother) includes ego, fullSib, and halfSib', () => {
    const descs = graph.descendants(motherId);
    expect(descs.has(egoId)).toBe(true);
    expect(descs.has(fullSibId)).toBe(true);
    expect(descs.has(halfSibId)).toBe(true);
  });
});

/**
 * Consanguinity (cyclic) fixture:
 *
 *   A → B → C → A  (each is also the child of the next — a loop)
 *
 * propagate from A over childrenOf must terminate without infinite recursion.
 */
const cyclicNodes: NcNode[] = [makeNode('A'), makeNode('B'), makeNode('C')];
const cyclicEdges: NcEdge[] = [
  makeGeneticEdge('A', 'B'),
  makeGeneticEdge('B', 'C'),
  makeGeneticEdge('C', 'A'), // closes the loop
];

describe('buildGeneticGraph — consanguinity loop termination', () => {
  const cyclicGraph = buildGeneticGraph(
    cyclicNodes,
    cyclicEdges,
    config,
    stubResolveSex({}),
  );

  it('propagate over childrenOf terminates and visits all reachable nodes', () => {
    const visited = new Set<string>();
    const result = cyclicGraph.propagate(
      ['A'],
      (id) => cyclicGraph.childrenOf(id),
      visited,
    );
    // All three nodes are in the loop, all should be visited
    expect(result.has('A')).toBe(true);
    expect(result.has('B')).toBe(true);
    expect(result.has('C')).toBe(true);
  });

  it('propagate does not throw a stack overflow on a cyclic graph', () => {
    expect(() =>
      cyclicGraph.propagate(['A'], (id) => cyclicGraph.childrenOf(id)),
    ).not.toThrow();
  });
});

describe('buildGeneticGraph — non-genetic edges ignored', () => {
  const socialEdge: NcEdge = {
    [entityPrimaryKeyProperty]: 'social-edge',
    type: 'family',
    from: 'x',
    to: 'y',
    [entityAttributesProperty]: {
      [RELATIONSHIP_TYPE_VAR]: ['social'],
    },
  };

  it('social edges do not count as genetic parent edges', () => {
    const g = buildGeneticGraph(
      [makeNode('x'), makeNode('y')],
      [socialEdge],
      config,
      stubResolveSex({}),
    );
    expect(g.parentsOf('y')).toHaveLength(0);
    expect(g.childrenOf('x')).toHaveLength(0);
  });
});

describe('buildGeneticGraph — donor edges', () => {
  const donorEdge: NcEdge = {
    [entityPrimaryKeyProperty]: 'donor-edge',
    type: 'family',
    from: 'donor',
    to: 'child',
    [entityAttributesProperty]: {
      [RELATIONSHIP_TYPE_VAR]: ['donor'],
    },
  };

  it('donor edges count as genetic parent edges', () => {
    const g = buildGeneticGraph(
      [makeNode('donor'), makeNode('child')],
      [donorEdge],
      config,
      stubResolveSex({ donor: 'male' }),
    );
    const parents = g.parentsOf('child');
    expect(parents).toHaveLength(1);
    expect(parents[0]).toEqual({ id: 'donor', sex: 'male' });
  });
});

describe('buildGeneticGraph — mitochondrial donation (MRT) inference', () => {
  const GAMETE_ROLE_VAR = 'gameteRole';
  const mrtConfig = {
    relationshipTypeVariable: RELATIONSHIP_TYPE_VAR,
    gameteRoleVariable: GAMETE_ROLE_VAR,
  };

  function makeGameteEdge(
    from: string,
    to: string,
    relType: 'biological' | 'donor',
    gameteRole: 'egg' | 'sperm',
  ): NcEdge {
    return {
      [entityPrimaryKeyProperty]: `${from}->${to}`,
      type: 'family',
      from,
      to,
      [entityAttributesProperty]: {
        [RELATIONSHIP_TYPE_VAR]: [relType],
        [GAMETE_ROLE_VAR]: [gameteRole],
      },
    };
  }

  // MRT birth: nucleus from the intended mother's egg, mtDNA from the enucleated
  // donor egg, sperm from the father.
  const mrtNodes = [
    makeNode('mother'),
    makeNode('donor'),
    makeNode('father'),
    makeNode('child'),
  ];
  const mrtEdges = [
    makeGameteEdge('mother', 'child', 'biological', 'egg'),
    makeGameteEdge('donor', 'child', 'donor', 'egg'),
    makeGameteEdge('father', 'child', 'biological', 'sperm'),
  ];
  const mrtSex = stubResolveSex({
    mother: 'female',
    donor: 'female',
    father: 'male',
    child: 'female',
  });

  it('nuclear parents are the intended mother and father, not the mtDNA donor', () => {
    const g = buildGeneticGraph(mrtNodes, mrtEdges, mrtConfig, mrtSex);
    expect(
      g
        .parentsOf('child')
        .map((p) => p.id)
        .toSorted(),
    ).toEqual(['father', 'mother']);
    expect(g.childrenOf('donor')).toHaveLength(0);
    expect(g.childrenOf('mother')).toEqual(['child']);
  });

  it('mtDNA comes from the donor egg, not the intended mother', () => {
    const g = buildGeneticGraph(mrtNodes, mrtEdges, mrtConfig, mrtSex);
    expect(g.mitochondrialParentsOf('child')).toEqual(['donor']);
    expect(g.mitochondrialChildrenOf('donor')).toEqual(['child']);
    expect(g.mitochondrialChildrenOf('mother')).toHaveLength(0);
  });

  it('standard egg donation (a single donor egg) keeps the donor as a full genetic mother', () => {
    const nodes = [makeNode('donor'), makeNode('father'), makeNode('child')];
    const edges = [
      makeGameteEdge('donor', 'child', 'donor', 'egg'),
      makeGameteEdge('father', 'child', 'biological', 'sperm'),
    ];
    const g = buildGeneticGraph(
      nodes,
      edges,
      mrtConfig,
      stubResolveSex({ donor: 'female', father: 'male' }),
    );
    // The lone donor egg is BOTH the nuclear mother and the mtDNA source.
    expect(
      g
        .parentsOf('child')
        .map((p) => p.id)
        .toSorted(),
    ).toEqual(['donor', 'father']);
    expect(g.mitochondrialParentsOf('child')).toEqual(['donor']);
  });

  it('without gamete roles, the mtDNA source falls back to the female parent', () => {
    const nodes = [makeNode('mum'), makeNode('dad'), makeNode('kid')];
    const edges = [
      makeGeneticEdge('mum', 'kid'),
      makeGeneticEdge('dad', 'kid'),
    ];
    const g = buildGeneticGraph(
      nodes,
      edges,
      config,
      stubResolveSex({ mum: 'female', dad: 'male' }),
    );
    expect(g.mitochondrialParentsOf('kid')).toEqual(['mum']);
    expect(
      g
        .parentsOf('kid')
        .map((p) => p.id)
        .toSorted(),
    ).toEqual(['dad', 'mum']);
  });
});

describe('buildGeneticGraph — duplicate edge de-duplication', () => {
  const parentId = 'parent-A';
  const childId = 'child-X';
  const dupNodes: NcNode[] = [makeNode(parentId), makeNode(childId)];

  const dupEdge1: NcEdge = {
    [entityPrimaryKeyProperty]: 'edge-1',
    type: 'family',
    from: parentId,
    to: childId,
    [entityAttributesProperty]: { [RELATIONSHIP_TYPE_VAR]: ['biological'] },
  };

  const dupEdge2: NcEdge = {
    [entityPrimaryKeyProperty]: 'edge-2',
    type: 'family',
    from: parentId,
    to: childId,
    [entityAttributesProperty]: { [RELATIONSHIP_TYPE_VAR]: ['biological'] },
  };

  it('two identical parent→child edges produce exactly one parent entry', () => {
    const g = buildGeneticGraph(
      dupNodes,
      [dupEdge1, dupEdge2],
      config,
      stubResolveSex({}),
    );
    const parents = g.parentsOf(childId);
    expect(parents).toHaveLength(1);
    expect(parents[0]).toMatchObject({ id: parentId });
  });

  it('two identical parent→child edges produce exactly one child entry', () => {
    const g = buildGeneticGraph(
      dupNodes,
      [dupEdge1, dupEdge2],
      config,
      stubResolveSex({}),
    );
    expect(g.childrenOf(parentId)).toHaveLength(1);
  });
});

describe('buildGeneticGraph — duplicate edge correctness guard (AR pseudodominance)', () => {
  /**
   * A single affected parent A with a DUPLICATED edge to child.
   * After de-dup, parentsOf(child) = [A] (length 1), so bothParentsAffected
   * is false — child must be obligateCarrier, NOT obligateAffected.
   */
  const parentAId = 'parent-A-ar';
  const childId = 'child-ar';

  const dupNodes: NcNode[] = [makeNode(parentAId), makeNode(childId)];

  const dupEdge1: NcEdge = {
    [entityPrimaryKeyProperty]: 'ar-dup-1',
    type: 'family',
    from: parentAId,
    to: childId,
    [entityAttributesProperty]: { [RELATIONSHIP_TYPE_VAR]: ['biological'] },
  };

  const dupEdge2: NcEdge = {
    [entityPrimaryKeyProperty]: 'ar-dup-2',
    type: 'family',
    from: parentAId,
    to: childId,
    [entityAttributesProperty]: { [RELATIONSHIP_TYPE_VAR]: ['biological'] },
  };

  it('single affected parent via duplicated edge → child is obligateCarrier, NOT obligateAffected', () => {
    const g = buildGeneticGraph(
      dupNodes,
      [dupEdge1, dupEdge2],
      config,
      stubResolveSex({}),
    );
    const affected = new Set([parentAId]);
    const result = computeAutosomalRecessive(g, affected);
    const childStatus = result.get(childId) ?? 'unknown';
    expect(childStatus).toBe('obligateCarrier');
    expect(childStatus).not.toBe('obligateAffected');
  });
});
