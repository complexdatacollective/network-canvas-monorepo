import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import {
  geneticParentCandidates,
  socialParentCandidates,
} from '../parentCandidates';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
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
});
