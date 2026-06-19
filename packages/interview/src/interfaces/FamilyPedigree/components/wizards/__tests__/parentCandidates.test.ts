import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type {
  FamilyEdge,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import {
  geneticParentCandidates,
  nominatedGameteRoles,
  socialParentCandidates,
} from '../parentCandidates';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGC',
};

function edge(from: string, to: string, rel: string): [string, NcEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    { _uid: id, type: 'family', from, to, attributes: { rel, isActive: true } },
  ];
}

// Tree: mum + dad -> ego ; grandma -> mum ; ego -> kid ; mum partnered with steve ;
// donor -> otherchild (a previously used donor)
function makeEdges(): Map<string, NcEdge> {
  return new Map<string, NcEdge>([
    edge('mum', 'ego', 'biological'),
    edge('dad', 'ego', 'biological'),
    edge('grandma', 'mum', 'biological'),
    edge('ego', 'kid', 'biological'),
    edge('mum', 'steve', 'partner'),
    edge('donor', 'otherchild', 'donor'),
  ]);
}

describe('geneticParentCandidates', () => {
  it('sibling: parents + their partners + donors, excludes ego/children/grandparents', () => {
    const result = geneticParentCandidates(
      'ego',
      'sibling',
      makeEdges(),
      variableConfig,
    );
    expect(result.has('mum')).toBe(true);
    expect(result.has('dad')).toBe(true);
    expect(result.has('steve')).toBe(true);
    expect(result.has('donor')).toBe(true);
    expect(result.has('ego')).toBe(false);
    expect(result.has('kid')).toBe(false);
    expect(result.has('grandma')).toBe(false);
  });

  it('child: anchor + partners + donors, excludes the anchor children', () => {
    const result = geneticParentCandidates(
      'ego',
      'child',
      makeEdges(),
      variableConfig,
    );
    expect(result.has('ego')).toBe(true);
    expect(result.has('donor')).toBe(true);
    expect(result.has('kid')).toBe(false);
    expect(result.has('mum')).toBe(false);
  });

  it("offers the anchor's siblings as child donors, but never as the anchor's own or a new sibling's parent", () => {
    const edges = new Map<string, NcEdge>([
      ...makeEdges(),
      edge('mum', 'sis', 'biological'),
      edge('dad', 'sis', 'biological'),
    ]);
    // A sibling can donate a gamete for the anchor's child.
    expect(
      geneticParentCandidates('ego', 'child', edges, variableConfig).has('sis'),
    ).toBe(true);
    // But a same-generation sibling can't be the anchor's own parent…
    expect(
      geneticParentCandidates(
        'ego',
        'define-parents',
        edges,
        variableConfig,
      ).has('sis'),
    ).toBe(false);
    // …nor a new sibling's parent.
    expect(
      geneticParentCandidates('ego', 'sibling', edges, variableConfig).has(
        'sis',
      ),
    ).toBe(false);
  });

  it('define-parents: partners of existing parents + donors, excludes anchor and its existing parents', () => {
    const result = geneticParentCandidates(
      'ego',
      'define-parents',
      makeEdges(),
      variableConfig,
    );
    expect(result.has('steve')).toBe(true);
    expect(result.has('donor')).toBe(true);
    expect(result.has('ego')).toBe(false);
    expect(result.has('mum')).toBe(false);
    expect(result.has('dad')).toBe(false);
  });

  it("define-parents: never offers the anchor's own partner, even if they are a donor", () => {
    const edges = new Map<string, NcEdge>([
      ...makeEdges(),
      edge('ego', 'spouse', 'partner'),
      // The spouse has also donated elsewhere, so they enter the donor pool.
      edge('spouse', 'spouses-other-child', 'donor'),
    ]);
    const result = geneticParentCandidates(
      'ego',
      'define-parents',
      edges,
      variableConfig,
    );
    expect(result.has('spouse')).toBe(false);
    expect(result.has('steve')).toBe(true);
  });
});

describe('socialParentCandidates', () => {
  it('includes grandparents/partners, excludes anchor, descendants, existing parents', () => {
    const nodes = new Map(
      [
        'ego',
        'mum',
        'dad',
        'grandma',
        'kid',
        'steve',
        'donor',
        'otherchild',
      ].map((id) => [id, { _uid: id, type: 'person', attributes: {} }]),
    );
    const result = socialParentCandidates(
      'ego',
      nodes,
      makeEdges(),
      variableConfig,
    );
    expect(result.has('grandma')).toBe(true);
    expect(result.has('steve')).toBe(true);
    expect(result.has('ego')).toBe(false);
    expect(result.has('kid')).toBe(false);
    expect(result.has('mum')).toBe(false);
    expect(result.has('dad')).toBe(false);
  });

  it("excludes the anchor's own partner (a partner cannot be a parent)", () => {
    const nodes = new Map(
      ['ego', 'mum', 'dad', 'grandma', 'kid', 'steve', 'spouse'].map((id) => [
        id,
        { _uid: id, type: 'person', attributes: {} },
      ]),
    );
    const edges = new Map<string, NcEdge>([
      ...makeEdges(),
      edge('ego', 'spouse', 'partner'),
    ]);
    const result = socialParentCandidates('ego', nodes, edges, variableConfig);
    expect(result.has('spouse')).toBe(false);
    // A grandparent is still a valid social/adoptive parent.
    expect(result.has('grandma')).toBe(true);
  });
});

describe('nominatedGameteRoles', () => {
  function gameteEdge(
    from: string,
    to: string,
    gameteRole: 'egg' | 'sperm',
  ): [string, FamilyEdge] {
    const id = `${from}->${to}:${gameteRole}`;
    return [
      id,
      {
        _uid: id,
        type: 'family',
        from,
        to,
        attributes: { rel: 'biological', isActive: true },
        gameteRole,
      },
    ];
  }

  it('maps each node to the gamete role it was nominated for', () => {
    // Linda is the egg parent of ego; Robert the sperm parent.
    const edges = new Map<string, FamilyEdge>([
      gameteEdge('linda', 'ego', 'egg'),
      gameteEdge('robert', 'ego', 'sperm'),
      gameteEdge('linda', 'robert', 'egg'),
    ]);
    const roles = nominatedGameteRoles(edges);
    expect(roles.get('linda')).toBe('egg');
    expect(roles.get('robert')).toBe('sperm');
    expect(roles.has('ego')).toBe(false);
  });

  it('ignores edges without a gamete role', () => {
    const edges = new Map<string, FamilyEdge>([
      edge('mum', 'ego', 'biological'),
      edge('dad', 'ego', 'biological'),
    ]);
    const roles = nominatedGameteRoles(edges);
    expect(roles.size).toBe(0);
  });
});
