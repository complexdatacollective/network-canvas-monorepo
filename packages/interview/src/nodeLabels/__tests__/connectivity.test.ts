import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';

import { buildConnectivityIndex } from '../connectivity';

const node = (id: string, type = 'person'): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type,
});

const edge = (
  id: string,
  from: string,
  to: string,
  type = 'knows',
): NcEdge => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type,
  from,
  to,
});

describe('buildConnectivityIndex', () => {
  const nodes = [node('a'), node('b'), node('c'), node('p', 'place')];
  const edges = [
    edge('1', 'a', 'b'),
    edge('2', 'a', 'c', 'likes'),
    edge('3', 'a', 'a'),
    edge('4', 'a', 'p', 'visits'),
  ];
  const index = buildConnectivityIndex(nodes, edges);

  it('counts each edge of a node once, whichever end it is', () => {
    expect(index.degree('a')).toBe(4);
    expect(index.degree('b')).toBe(1);
    expect(index.degree('nobody')).toBe(0);
  });

  it('counts the edges of one type', () => {
    expect(index.degree('a', 'knows')).toBe(2);
    expect(index.degree('c', 'knows')).toBe(0);
    expect(index.degree('c', 'likes')).toBe(1);
  });

  it('gives the fewest and the most among the nodes of one type', () => {
    expect(index.extremes('person')).toEqual({ min: 1, max: 4 });
    expect(index.extremes('person', 'likes')).toEqual({ min: 0, max: 1 });
    expect(index.extremes('place')).toEqual({ min: 1, max: 1 });
    expect(index.extremes('nothing')).toEqual({ min: 0, max: 0 });
  });

  it('lists the edges that join a node to another', () => {
    expect(index.edgesOf('c').map((each) => each.type)).toEqual(['likes']);
    expect(index.edgesOf('nobody')).toEqual([]);
  });
});
