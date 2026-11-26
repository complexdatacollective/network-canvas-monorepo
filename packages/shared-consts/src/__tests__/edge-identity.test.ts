import { describe, expect, it } from 'vitest';

import { edgeIdentityKey, findEdge, toggleEdge } from '../edge-identity.ts';

const edge = (id: string, from: string, to: string, type = 'friend') => ({
  _uid: id,
  from,
  to,
  type,
});

describe('edgeIdentityKey', () => {
  it('undirected key is the same both ways', () => {
    expect(edgeIdentityKey(edge('e', 'a', 'b'), false)).toBe(
      edgeIdentityKey(edge('e', 'b', 'a'), false),
    );
  });

  it('directed key differs by order', () => {
    expect(edgeIdentityKey(edge('e', 'a', 'b'), true)).not.toBe(
      edgeIdentityKey(edge('e', 'b', 'a'), true),
    );
  });

  it('keys differ by edge type', () => {
    expect(edgeIdentityKey(edge('e', 'a', 'b', 'friend'), false)).not.toBe(
      edgeIdentityKey(edge('e', 'a', 'b', 'advice'), false),
    );
  });

  it.each(['|', ',', ':', '"', ' ', '\\'])(
    'does not confuse ids or types that contain %j',
    (separator) => {
      for (const directed of [true, false]) {
        expect(
          edgeIdentityKey(edge('e', `a${separator}b`, 'c'), directed),
        ).not.toBe(edgeIdentityKey(edge('e', 'a', `b${separator}c`), directed));
        expect(
          edgeIdentityKey(edge('e', 'b', 'c', `t${separator}a`), directed),
        ).not.toBe(
          edgeIdentityKey(edge('e', `a${separator}b`, 'c', 't'), directed),
        );
      }
    },
  );

  it('does not confuse an empty id with a shifted one', () => {
    expect(edgeIdentityKey(edge('e', '', 'ab'), true)).not.toBe(
      edgeIdentityKey(edge('e', 'a', 'b'), true),
    );
  });
});

describe('findEdge', () => {
  const edges = [edge('ab', 'a', 'b'), edge('cd', 'c', 'd', 'advice')];

  it('finds the reverse edge only when undirected', () => {
    const reverse = { from: 'b', to: 'a', type: 'friend' };
    expect(findEdge(edges, reverse, false)?._uid).toBe('ab');
    expect(findEdge(edges, reverse, true)).toBeUndefined();
  });

  it('finds the same-order edge in either mode', () => {
    const same = { from: 'c', to: 'd', type: 'advice' };
    expect(findEdge(edges, same, false)?._uid).toBe('cd');
    expect(findEdge(edges, same, true)?._uid).toBe('cd');
  });

  it('does not match an edge of another type', () => {
    expect(
      findEdge(edges, { from: 'a', to: 'b', type: 'advice' }, false),
    ).toBeUndefined();
  });

  it('does not match the reverse edge of another type', () => {
    expect(
      findEdge(
        [edge('ab', 'a', 'b')],
        { from: 'b', to: 'a', type: 'advice' },
        false,
      ),
    ).toBeUndefined();
  });
});

// Pairs that share exactly one endpoint with the stored a-b edge, in each
// position and order.
const sharingOneEndpoint = [
  { from: 'a', to: 'c', type: 'friend' },
  { from: 'c', to: 'b', type: 'friend' },
  { from: 'b', to: 'c', type: 'friend' },
  { from: 'c', to: 'a', type: 'friend' },
];

describe.each([false, true])('with directed %s', (directed) => {
  const edges = [edge('ab', 'a', 'b')];

  it.each(sharingOneEndpoint)(
    'findEdge does not match a pair sharing one endpoint: $from to $to',
    (endpoints) => {
      expect(findEdge(edges, endpoints, directed)).toBeUndefined();
    },
  );

  it.each(sharingOneEndpoint)(
    'toggleEdge adds a pair sharing one endpoint: $from to $to',
    (endpoints) => {
      expect(toggleEdge(edges, endpoints, directed)).toEqual({
        action: 'add',
      });
    },
  );
});

describe('toggleEdge', () => {
  it('toggleEdge refuses a self-loop', () => {
    expect(
      toggleEdge([], { from: 'a', to: 'a', type: 'friend' }, false),
    ).toEqual({ action: 'refuse', reason: 'selfLoop' });
    expect(
      toggleEdge([], { from: 'a', to: 'a', type: 'friend' }, true),
    ).toEqual({ action: 'refuse', reason: 'selfLoop' });
  });

  it('toggleEdge adds the opposite direction of a directed pair', () => {
    const edges = [edge('ab', 'a', 'b')];
    expect(
      toggleEdge(edges, { from: 'b', to: 'a', type: 'friend' }, true),
    ).toEqual({ action: 'add' });
  });

  it('toggleEdge removes the reverse edge of an undirected pair', () => {
    const edges = [edge('ab', 'a', 'b')];
    expect(
      toggleEdge(edges, { from: 'b', to: 'a', type: 'friend' }, false),
    ).toEqual({ action: 'remove', edge: edges[0] });
  });

  it('toggleEdge adds rather than removing the reverse edge of another type', () => {
    const edges = [edge('ab', 'a', 'b')];
    expect(
      toggleEdge(edges, { from: 'b', to: 'a', type: 'advice' }, false),
    ).toEqual({ action: 'add' });
  });

  it('toggleEdge removes the same-order edge of a directed pair', () => {
    const edges = [edge('ab', 'a', 'b')];
    expect(
      toggleEdge(edges, { from: 'a', to: 'b', type: 'friend' }, true),
    ).toEqual({ action: 'remove', edge: edges[0] });
  });
});
