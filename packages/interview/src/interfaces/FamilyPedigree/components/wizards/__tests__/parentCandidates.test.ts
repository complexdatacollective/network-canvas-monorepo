import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';
import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type {
  FamilyEdge,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import {
  geneticParentCandidates,
  nominatedGameteRoles,
  partnerCandidates,
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
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

function edge(from: string, to: string, rel: string): [string, NcEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    {
      _uid: id,
      type: 'family',
      from,
      to,
      [entityAttributesProperty]: { rel: [rel], isActive: true },
    },
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

  it('child: an existing partner (consanguineous or otherwise) is offered as a co-parent', () => {
    const edges = new Map<string, NcEdge>([
      ...makeEdges(),
      edge('ego', 'cousin', 'partner'),
    ]);
    const coParents = geneticParentCandidates(
      'ego',
      'child',
      edges,
      variableConfig,
    );
    expect(coParents.has('cousin')).toBe(true); // partner is a valid co-parent
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
      ].map((id) => [
        id,
        { _uid: id, type: 'person', [entityAttributesProperty]: {} },
      ]),
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
        { _uid: id, type: 'person', [entityAttributesProperty]: {} },
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

describe('partnerCandidates', () => {
  // Tree: mum + dad -> ego; ego -> kid; mum + dad -> sib (full sibling);
  // dad -> uncle (half-sib of mum, but not of ego — uncle is dad's other child);
  // uncle -> cousin; grandma -> mum
  function makeNodes(): Map<string, NcNode> {
    return new Map(
      ['ego', 'mum', 'dad', 'sib', 'kid', 'uncle', 'cousin', 'grandma'].map(
        (id) => [
          id,
          { _uid: id, type: 'person', [entityAttributesProperty]: {} },
        ],
      ),
    );
  }

  function makePartnerEdges(): Map<string, NcEdge> {
    return new Map<string, NcEdge>([
      edge('mum', 'ego', 'biological'),
      edge('dad', 'ego', 'biological'),
      edge('ego', 'kid', 'biological'),
      edge('mum', 'sib', 'biological'),
      edge('dad', 'sib', 'biological'),
      edge('dad', 'uncle', 'biological'),
      edge('uncle', 'cousin', 'biological'),
      edge('grandma', 'mum', 'biological'),
    ]);
  }

  it('excludes self, parents, children, and full siblings; includes half-degree+ relatives', () => {
    const c = partnerCandidates(
      'ego',
      makeNodes(),
      makePartnerEdges(),
      variableConfig,
    );
    expect([...c].toSorted()).toEqual(
      ['cousin', 'grandma', 'uncle'].toSorted(),
    );
    expect(c.has('ego')).toBe(false); // self
    expect(c.has('mum')).toBe(false); // parent
    expect(c.has('dad')).toBe(false); // parent
    expect(c.has('kid')).toBe(false); // child
    expect(c.has('sib')).toBe(false); // full sibling
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
        // gameteRole now lives as a network edge attribute, not a separate field
        [entityAttributesProperty]: {
          rel: ['biological'],
          isActive: true,
          gameteRole,
        },
      },
    ];
  }

  it('maps each node to the gamete role it was nominated for (reads from attributes)', () => {
    // Linda is the egg parent of ego; Robert the sperm parent.
    const edges = new Map<string, FamilyEdge>([
      gameteEdge('linda', 'ego', 'egg'),
      gameteEdge('robert', 'ego', 'sperm'),
      gameteEdge('linda', 'robert', 'egg'),
    ]);
    const roles = nominatedGameteRoles(edges, variableConfig);
    expect(roles.get('linda')).toBe('egg');
    expect(roles.get('robert')).toBe('sperm');
    expect(roles.has('ego')).toBe(false);
  });

  it('ignores edges without a gamete role attribute', () => {
    const edges = new Map<string, FamilyEdge>([
      edge('mum', 'ego', 'biological'),
      edge('dad', 'ego', 'biological'),
    ]);
    const roles = nominatedGameteRoles(edges, variableConfig);
    expect(roles.size).toBe(0);
  });
});
