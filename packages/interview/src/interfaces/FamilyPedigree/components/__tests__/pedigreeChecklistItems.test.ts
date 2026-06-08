import { describe, expect, it } from 'vitest';

import type { NcEdge } from '@codaco/shared-consts';

import {
  buildParentsItem,
  partnersNeedingParents,
} from '../pedigreeChecklistItems';

const REL = 'rel';

function edge(from: string, to: string, rel: string): [string, NcEdge] {
  const id = `${from}->${to}:${rel}`;
  return [
    id,
    { _uid: id, type: 'family', from, to, attributes: { [REL]: rel } },
  ];
}

describe('partnersNeedingParents', () => {
  it('includes a partner who is a genetic parent of an ego child', () => {
    const edges = new Map<string, NcEdge>([
      edge('ego', 'p', 'partner'),
      edge('ego', 'kid', 'biological'),
      edge('p', 'kid', 'biological'),
    ]);
    expect(partnersNeedingParents('ego', edges, REL)).toEqual(['p']);
  });

  it('excludes a childless partner', () => {
    const edges = new Map<string, NcEdge>([edge('ego', 'p', 'partner')]);
    expect(partnersNeedingParents('ego', edges, REL)).toEqual([]);
  });

  it('excludes a partner who only socially co-parents the child', () => {
    const edges = new Map<string, NcEdge>([
      edge('ego', 'p', 'partner'),
      edge('ego', 'kid', 'biological'),
      edge('p', 'kid', 'social'),
    ]);
    expect(partnersNeedingParents('ego', edges, REL)).toEqual([]);
  });
});

describe('buildParentsItem', () => {
  function withParents(count: number): Map<string, NcEdge> {
    const edges = new Map<string, NcEdge>();
    for (let i = 0; i < count; i++) {
      const [id, e] = edge(`gp${String(i)}`, 'p', 'biological');
      edges.set(id, e);
    }
    return edges;
  }

  it('is not done and prompts for parents when none are recorded', () => {
    const item = buildParentsItem(
      'p',
      'Alex',
      'partner-parents',
      withParents(0),
      REL,
      new Set(),
    );
    expect(item.id).toBe('partner-parents-p');
    expect(item.done).toBe(false);
    expect(item.label).toBe('Add parents for Alex');
    expect(item.required).toBe(false);
  });

  it('prompts for one more when a single parent is recorded', () => {
    const item = buildParentsItem(
      'p',
      'Alex',
      'partner-parents',
      withParents(1),
      REL,
      new Set(),
    );
    expect(item.done).toBe(false);
    expect(item.label).toBe('Add 1 more parent for Alex');
  });

  it('is done once two parents are recorded', () => {
    const item = buildParentsItem(
      'p',
      'Alex',
      'partner-parents',
      withParents(2),
      REL,
      new Set(),
    );
    expect(item.done).toBe(true);
  });

  it('is done when manually checked off', () => {
    const item = buildParentsItem(
      'p',
      'Alex',
      'partner-parents',
      withParents(0),
      REL,
      new Set(['partner-parents-p']),
    );
    expect(item.done).toBe(true);
  });
});
