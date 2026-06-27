import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { buildGeneticGraph } from '../geneticGraph';

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
