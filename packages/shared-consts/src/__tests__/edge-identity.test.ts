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

  it('does not confuse ids that contain the separator', () => {
    expect(edgeIdentityKey(edge('e', 'a|b', 'c'), true)).not.toBe(
      edgeIdentityKey(edge('e', 'a', 'b|c'), true),
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

  it('toggleEdge removes the same-order edge of a directed pair', () => {
    const edges = [edge('ab', 'a', 'b')];
    expect(
      toggleEdge(edges, { from: 'a', to: 'b', type: 'friend' }, true),
    ).toEqual({ action: 'remove', edge: edges[0] });
  });
});
