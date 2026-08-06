import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';

import {
  edgesWithinPedigreeMembership,
  pedigreeEdgeMembership,
  pedigreeMemberEdgeIds,
  pedigreeMemberIds,
} from '../pedigreeMembership';

describe('pedigreeMemberIds', () => {
  it('returns null when metadata is undefined', () => {
    expect(pedigreeMemberIds(undefined)).toBeNull();
  });

  it('returns null for census (array) metadata', () => {
    expect(pedigreeMemberIds([[0, 'a', 'b', true]])).toBeNull();
  });

  it('returns null when the pedigree has no committed node list', () => {
    expect(pedigreeMemberIds({ isNetworkCommitted: true })).toBeNull();
  });

  it('returns the set of committed node ids', () => {
    const members = pedigreeMemberIds({
      isNetworkCommitted: true,
      nodes: [
        { id: 'ego', label: 'You', isEgo: true },
        { id: 'mother', label: 'Rose', isEgo: false },
      ],
    });
    expect(members).not.toBeNull();
    expect(members?.has('ego')).toBe(true);
    expect(members?.has('mother')).toBe(true);
    expect(members?.has('non-kin')).toBe(false);
    expect(members?.size).toBe(2);
  });
});

describe('pedigreeMemberEdgeIds', () => {
  it('returns the set of committed edge ids', () => {
    const members = pedigreeMemberEdgeIds({
      isNetworkCommitted: true,
      edges: [{ id: 'mother-ego', from: 'mother', to: 'ego', attributes: {} }],
    });
    expect(members).toEqual(new Set(['mother-ego']));
  });

  it('returns null when the pedigree has no committed edge list', () => {
    expect(pedigreeMemberEdgeIds({ isNetworkCommitted: true })).toBeNull();
  });
});

describe('pedigreeEdgeMembership', () => {
  it('marks versioned edge ids as shared-network ids', () => {
    expect(
      pedigreeEdgeMembership({
        isNetworkCommitted: true,
        edgeIdVersion: 1,
        edges: [
          { id: 'mother-ego', from: 'mother', to: 'ego', attributes: {} },
        ],
      }),
    ).toEqual({ ids: new Set(['mother-ego']), idFormat: 'network' });
  });

  it('marks unversioned edge ids as legacy interface-local ids', () => {
    expect(
      pedigreeEdgeMembership({
        isNetworkCommitted: true,
        edges: [
          { id: 'mother-ego', from: 'mother', to: 'ego', attributes: {} },
        ],
      }),
    ).toEqual({ ids: new Set(['mother-ego']), idFormat: 'legacy' });
  });
});

describe('edgesWithinPedigreeMembership', () => {
  const edge = (id: string, from: string, to: string, type = 'family') =>
    ({ _uid: id, from, to, type, attributes: {} }) as NcEdge;

  it('excludes later edges and edges with endpoints outside the pedigree', () => {
    const edges = [
      edge('committed', 'ego', 'mother'),
      edge('later-between-members', 'ego', 'mother'),
      edge('later-to-outsider', 'ego', 'outsider'),
      edge('wrong-type', 'ego', 'mother', 'friendship'),
    ];

    expect(
      edgesWithinPedigreeMembership(
        edges,
        'family',
        new Set(['ego', 'mother']),
        { ids: new Set(['committed']), idFormat: 'network' },
      ),
    ).toEqual([edges[0]]);
  });

  it('uses endpoint membership when committed edge ids are unavailable', () => {
    const edges = [
      edge('inside', 'ego', 'mother'),
      edge('outside', 'ego', 'outsider'),
    ];

    expect(
      edgesWithinPedigreeMembership(
        edges,
        'family',
        new Set(['ego', 'mother']),
        null,
      ),
    ).toEqual([edges[0]]);
  });

  it('uses endpoint membership when legacy committed ids no longer match network ids', () => {
    const edges = [
      edge('redux-mother-ego', 'ego', 'mother'),
      edge('outside', 'ego', 'outsider'),
    ];

    expect(
      edgesWithinPedigreeMembership(
        edges,
        'family',
        new Set(['ego', 'mother']),
        {
          ids: new Set(['zustand-mother-ego']),
          idFormat: 'legacy',
        },
      ),
    ).toEqual([edges[0]]);
  });

  it('uses endpoint membership when legacy and current committed ids are mixed', () => {
    const edges = [
      edge('redux-seeded', 'ego', 'mother'),
      edge('redux-added', 'ego', 'father'),
      edge('outside', 'ego', 'outsider'),
    ];

    expect(
      edgesWithinPedigreeMembership(
        edges,
        'family',
        new Set(['ego', 'mother', 'father']),
        {
          ids: new Set(['redux-seeded', 'zustand-added']),
          idFormat: 'legacy',
        },
      ),
    ).toEqual(edges.slice(0, 2));
  });

  it('keeps an explicitly empty committed edge list authoritative', () => {
    const edges = [edge('later-between-members', 'ego', 'mother')];

    expect(
      edgesWithinPedigreeMembership(
        edges,
        'family',
        new Set(['ego', 'mother']),
        { ids: new Set(), idFormat: 'network' },
      ),
    ).toEqual([]);
  });

  it('does not admit a later edge when a versioned committed edge was deleted', () => {
    const edges = [
      edge('still-committed', 'ego', 'mother'),
      edge('later-between-members', 'ego', 'father'),
    ];

    expect(
      edgesWithinPedigreeMembership(
        edges,
        'family',
        new Set(['ego', 'mother', 'father']),
        {
          ids: new Set(['still-committed', 'deleted-committed']),
          idFormat: 'network',
        },
      ),
    ).toEqual([edges[0]]);
  });
});
