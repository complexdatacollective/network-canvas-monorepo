import { describe, expect, it } from 'vitest';

import {
  edgeTypeAllowsAnyPair,
  edgeTypeAllowsEndpoints,
  getEligibleOrderedPairs,
  getEndpointRules,
  isDirectedEdgeType,
  validateNetworkAgainstEndpointRules,
} from '../edgeTypeRules.ts';

const codebook = {
  node: { person: {}, org: {} },
  edge: {
    knows: {},
    worksAt: { endpointRules: [{ sourceType: 'person', targetType: 'org' }] },
    advice: {
      directed: true as const,
      endpointRules: [{ sourceType: 'person', targetType: 'org' }],
    },
    supervises: {
      directed: true as const,
      endpointRules: [{ sourceType: 'person', targetType: 'person' }],
    },
    follows: { directed: true as const },
  },
};

const node = (_uid: string, type: string) => ({ _uid, type });

describe('edge type rules', () => {
  it('an unknown edge type is undirected with no rules', () => {
    expect(isDirectedEdgeType(codebook, 'missing')).toBe(false);
    expect(getEndpointRules(codebook, 'missing')).toBeUndefined();
    expect(edgeTypeAllowsEndpoints(codebook, 'missing', 'person', 'org')).toBe(
      true,
    );
    expect(isDirectedEdgeType({}, 'knows')).toBe(false);
  });

  it('does not read a prototype key as an edge type', () => {
    expect(isDirectedEdgeType(codebook, 'constructor')).toBe(false);
    expect(getEndpointRules(codebook, 'constructor')).toBeUndefined();
  });

  it('reads direction and rules from the codebook', () => {
    expect(isDirectedEdgeType(codebook, 'advice')).toBe(true);
    expect(isDirectedEdgeType(codebook, 'knows')).toBe(false);
    expect(getEndpointRules(codebook, 'advice')).toEqual([
      { sourceType: 'person', targetType: 'org' },
    ]);
    expect(getEndpointRules(codebook, 'knows')).toBeUndefined();
  });

  it('undirected rule accepts both orientations', () => {
    expect(edgeTypeAllowsEndpoints(codebook, 'worksAt', 'person', 'org')).toBe(
      true,
    );
    expect(edgeTypeAllowsEndpoints(codebook, 'worksAt', 'org', 'person')).toBe(
      true,
    );
    expect(
      edgeTypeAllowsEndpoints(codebook, 'worksAt', 'person', 'person'),
    ).toBe(false);
  });

  it('directed rule accepts only source to target', () => {
    expect(edgeTypeAllowsEndpoints(codebook, 'advice', 'person', 'org')).toBe(
      true,
    );
    expect(edgeTypeAllowsEndpoints(codebook, 'advice', 'org', 'person')).toBe(
      false,
    );
  });

  it('same-type rule allows two nodes of that type', () => {
    expect(
      edgeTypeAllowsEndpoints(codebook, 'supervises', 'person', 'person'),
    ).toBe(true);
    expect(
      getEligibleOrderedPairs(codebook, 'supervises', [
        node('a', 'person'),
        node('b', 'person'),
        node('o', 'org'),
      ]).map(([s, t]) => [s._uid, t._uid]),
    ).toEqual([
      ['a', 'b'],
      ['b', 'a'],
    ]);
  });

  it('edgeTypeAllowsAnyPair asks whether some pair of the types is allowed', () => {
    expect(edgeTypeAllowsAnyPair(codebook, 'knows', ['org'])).toBe(true);
    expect(edgeTypeAllowsAnyPair(codebook, 'worksAt', ['org'])).toBe(false);
    expect(edgeTypeAllowsAnyPair(codebook, 'worksAt', ['org', 'person'])).toBe(
      true,
    );
    expect(edgeTypeAllowsAnyPair(codebook, 'advice', ['org', 'person'])).toBe(
      true,
    );
    expect(edgeTypeAllowsAnyPair(codebook, 'supervises', ['person'])).toBe(
      true,
    );
    expect(edgeTypeAllowsAnyPair(codebook, 'supervises', ['org'])).toBe(false);
  });

  it('getEligibleOrderedPairs returns both directions for a directed type and one per pair for an undirected type', () => {
    const nodes = [node('a', 'person'), node('b', 'person'), node('c', 'org')];
    const ids = (edgeType: string) =>
      getEligibleOrderedPairs(codebook, edgeType, nodes).map(([s, t]) => [
        s._uid,
        t._uid,
      ]);

    expect(ids('follows')).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'a'],
      ['b', 'c'],
      ['c', 'a'],
      ['c', 'b'],
    ]);
    expect(ids('knows')).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
    expect(ids('advice')).toEqual([
      ['a', 'c'],
      ['b', 'c'],
    ]);
    // Allowed in the reverse orientation only, but undirected.
    expect(
      getEligibleOrderedPairs(codebook, 'worksAt', [
        node('o', 'org'),
        node('p', 'person'),
      ]).map(([s, t]) => [s._uid, t._uid]),
    ).toEqual([['o', 'p']]);
  });

  it('getEligibleOrderedPairs never pairs a node with itself', () => {
    const one = [node('a', 'person')];
    expect(getEligibleOrderedPairs(codebook, 'follows', one)).toEqual([]);
    expect(getEligibleOrderedPairs(codebook, 'knows', one)).toEqual([]);
    expect(getEligibleOrderedPairs(codebook, 'supervises', one)).toEqual([]);
    // The same node listed twice is still one node.
    const twice = [node('a', 'person'), node('a', 'person')];
    expect(getEligibleOrderedPairs(codebook, 'follows', twice)).toEqual([]);
    expect(getEligibleOrderedPairs(codebook, 'knows', twice)).toEqual([]);
  });
});

describe('validateNetworkAgainstEndpointRules', () => {
  const nodes = [node('p1', 'person'), node('p2', 'person'), node('o1', 'org')];
  const edge = (from: string, to: string, type: string) => ({
    from,
    to,
    type,
  });

  it('validateNetworkAgainstEndpointRules reports self-loop, duplicate under each identity, missing endpoint and disallowed types', () => {
    const edges = [
      edge('p1', 'p1', 'knows'),
      edge('p1', 'p2', 'knows'),
      edge('p2', 'p1', 'knows'),
      edge('p1', 'o1', 'advice'),
      edge('p1', 'o1', 'advice'),
      edge('p1', 'ghost', 'knows'),
      edge('o1', 'p1', 'advice'),
    ];
    expect(
      validateNetworkAgainstEndpointRules({ nodes, edges }, codebook),
    ).toEqual([
      { kind: 'selfLoop', edgeIndex: 0, edgeType: 'knows' },
      {
        kind: 'duplicate',
        edgeIndex: 2,
        edgeType: 'knows',
        duplicateOfIndex: 1,
      },
      {
        kind: 'duplicate',
        edgeIndex: 4,
        edgeType: 'advice',
        duplicateOfIndex: 3,
      },
      {
        kind: 'missingEndpoint',
        edgeIndex: 5,
        edgeType: 'knows',
        end: 'to',
      },
      {
        kind: 'endpointTypesNotAllowed',
        edgeIndex: 6,
        edgeType: 'advice',
        sourceType: 'org',
        targetType: 'person',
      },
    ]);
  });

  it('reversed duplicate is a duplicate only for an undirected type', () => {
    const reversed = (type: string) =>
      validateNetworkAgainstEndpointRules(
        { nodes, edges: [edge('p1', 'p2', type), edge('p2', 'p1', type)] },
        codebook,
      );
    expect(reversed('knows')).toEqual([
      {
        kind: 'duplicate',
        edgeIndex: 1,
        edgeType: 'knows',
        duplicateOfIndex: 0,
      },
    ]);
    expect(reversed('follows')).toEqual([]);
  });

  it('judges no endpoint types when nodes carry no type', () => {
    expect(
      validateNetworkAgainstEndpointRules(
        {
          nodes: [{ _uid: 'o1' }, { _uid: 'p1' }],
          edges: [edge('o1', 'p1', 'advice')],
        },
        codebook,
      ),
    ).toEqual([]);
    // Nor when the node type or the edge type is not in the codebook.
    expect(
      validateNetworkAgainstEndpointRules(
        {
          nodes: [node('o1', 'venue'), node('p1', 'person')],
          edges: [edge('o1', 'p1', 'advice'), edge('p1', 'o1', 'unknown')],
        },
        codebook,
      ),
    ).toEqual([]);
    // A known source with a target whose type is not in the codebook.
    expect(
      validateNetworkAgainstEndpointRules(
        {
          nodes: [node('p1', 'person'), node('v1', 'venue')],
          edges: [edge('p1', 'v1', 'advice')],
        },
        codebook,
      ),
    ).toEqual([]);
  });

  it('reports a missing endpoint only when every node carries _uid', () => {
    expect(
      validateNetworkAgainstEndpointRules(
        {
          nodes: [node('p1', 'person'), { type: 'person' }],
          edges: [
            edge('p1', 'ghost', 'knows'),
            edge('ghost', 'ghost', 'knows'),
          ],
        },
        codebook,
      ),
    ).toEqual([{ kind: 'selfLoop', edgeIndex: 1, edgeType: 'knows' }]);
    expect(
      validateNetworkAgainstEndpointRules(
        {
          nodes: [node('p1', 'person')],
          edges: [edge('ghost', 'p1', 'knows')],
        },
        codebook,
      ),
    ).toEqual([
      { kind: 'missingEndpoint', edgeIndex: 0, edgeType: 'knows', end: 'from' },
    ]);
  });
});
