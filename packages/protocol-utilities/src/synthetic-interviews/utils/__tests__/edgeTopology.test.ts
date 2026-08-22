import { describe, expect, it } from 'vitest';

import type { EdgeTopology } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import { createSessionStreams } from '../../session-engine/streams';
import {
  chooseLinkedPairs,
  edgeForPair,
  unorderedPairs,
} from '../edgeTopology';

type DistributionOf<M extends EdgeTopology['metric']> = Extract<
  EdgeTopology,
  { metric: M }
>['distribution'];

const density = (distribution: DistributionOf<'density'>): EdgeTopology => ({
  metric: 'density',
  distribution,
});

const meanDegree = (
  distribution: DistributionOf<'meanDegree'>,
): EdgeTopology => ({ metric: 'meanDegree', distribution });

const alters = (count: number): NcNode[] =>
  Array.from({ length: count }, (_unused, index) => ({
    [entityPrimaryKeyProperty]: `alter-${index}`,
    type: 'person',
    [entityAttributesProperty]: {},
  }));

const networkWith = (edges: NcEdge[]): NcNetwork => ({
  ego: { [entityPrimaryKeyProperty]: 'ego', [entityAttributesProperty]: {} },
  nodes: alters(3),
  edges,
});

const edge = (from: string, to: string, type: string): NcEdge => ({
  [entityPrimaryKeyProperty]: `${from}-${to}-${type}`,
  type,
  from,
  to,
  [entityAttributesProperty]: {},
});

const targetsFor = (
  topology: EdgeTopology,
  { nodes = 10, seed = 7 }: { nodes?: number; seed?: number } = {},
): ReadonlySet<number> =>
  chooseLinkedPairs({
    topology,
    pairs: unorderedPairs(alters(nodes)),
    nodeCount: nodes,
    streams: createSessionStreams(seed, 0),
  });

describe('unorderedPairs', () => {
  it('pairs each person with everybody after them, in node-list order', () => {
    expect(unorderedPairs(alters(3))).toEqual([
      ['alter-0', 'alter-1'],
      ['alter-0', 'alter-2'],
      ['alter-1', 'alter-2'],
    ]);
  });

  it('produces one pair per combination', () => {
    expect(unorderedPairs(alters(10))).toHaveLength(45);
  });

  it('has nothing to ask about one person, or none', () => {
    expect(unorderedPairs(alters(1))).toEqual([]);
    expect(unorderedPairs(alters(0))).toEqual([]);
  });
});

describe('edgeForPair', () => {
  it('finds an edge drawn the other way round', () => {
    const network = networkWith([edge('alter-1', 'alter-0', 'friend')]);

    expect(
      edgeForPair(network, ['alter-0', 'alter-1'], 'friend'),
    ).not.toBeNull();
  });

  it('does not mistake another edge type for this one', () => {
    const network = networkWith([edge('alter-0', 'alter-1', 'colleague')]);

    expect(edgeForPair(network, ['alter-0', 'alter-1'], 'friend')).toBeNull();
  });

  it('reports nothing for a pair nothing joins', () => {
    expect(
      edgeForPair(networkWith([]), ['alter-0', 'alter-2'], 'friend'),
    ).toBeNull();
  });
});

describe('chooseLinkedPairs', () => {
  it('links every pair at a density of one', () => {
    expect(
      targetsFor(density({ distribution: 'constant', value: 1 })).size,
    ).toBe(45);
  });

  it('links nothing at a density of zero', () => {
    expect(
      targetsFor(density({ distribution: 'constant', value: 0 })).size,
    ).toBe(0);
  });

  it('links the declared proportion of the pairs', () => {
    expect(
      targetsFor(density({ distribution: 'constant', value: 0.4 })).size,
    ).toBe(18);
  });

  it('reads a mean degree as ties per person', () => {
    // Ten people averaging three ties each is fifteen edges, because every
    // edge is one of two people's three.
    expect(
      targetsFor(meanDegree({ distribution: 'constant', value: 3 })).size,
    ).toBe(15);
  });

  it('never asks for more edges than the network has pairs', () => {
    expect(
      targetsFor(meanDegree({ distribution: 'constant', value: 40 }), {
        nodes: 5,
      }).size,
    ).toBe(10);
  });

  it('stays inside the declared window', () => {
    const sizes = Array.from(
      { length: 60 },
      (_unused, seed) =>
        targetsFor(density({ distribution: 'uniform', min: 0.2, max: 0.4 }), {
          seed,
        }).size,
    );

    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(18);
  });

  it('reads an unstated uniform window as the whole of a density', () => {
    const sizes = Array.from(
      { length: 200 },
      (_unused, seed) =>
        targetsFor(density({ distribution: 'uniform' }), { seed }).size,
    );

    // Uniform over 0-1 of 45 pairs: the run should reach both ends without
    // ever leaving them.
    expect(Math.min(...sizes)).toBeLessThan(5);
    expect(Math.max(...sizes)).toBeGreaterThan(40);
    expect(sizes.every((size) => size >= 0 && size <= 45)).toBe(true);
  });

  it('keeps a beta density inside the pairs it has', () => {
    const sizes = Array.from(
      { length: 200 },
      (_unused, seed) =>
        targetsFor(density({ distribution: 'beta', mean: 0.3, sd: 0.15 }), {
          seed,
        }).size,
    );
    const mean = sizes.reduce((total, size) => total + size, 0) / sizes.length;

    expect(sizes.every((size) => size >= 0 && size <= 45)).toBe(true);
    expect(Math.abs(mean / 45 - 0.3)).toBeLessThan(0.05);
  });

  it('truncates an open normal into the declared window rather than clamping', () => {
    const sizes = Array.from(
      { length: 200 },
      (_unused, seed) =>
        targetsFor(
          density({
            distribution: 'normal',
            mean: 0.5,
            sd: 0.4,
            min: 0.4,
            max: 0.6,
          }),
          { seed },
        ).size,
    );

    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(27);
    // Clamping would pile the rejected tails onto the two bounds; truncation
    // leaves the window's interior carrying most of the mass.
    const onABound = sizes.filter((size) => size === 18 || size === 27).length;
    expect(onABound / sizes.length).toBeLessThan(0.35);
  });

  it('picks the same pairs for the same seed, and different ones for another', () => {
    const topology = density({ distribution: 'constant', value: 0.4 });
    const ascending = (a: number, b: number) => a - b;
    const first = [...targetsFor(topology, { seed: 11 })].toSorted(ascending);
    const again = [...targetsFor(topology, { seed: 11 })].toSorted(ascending);
    const other = [...targetsFor(topology, { seed: 12 })].toSorted(ascending);

    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it('spreads its choices across the pair set rather than taking a prefix', () => {
    const topology = density({ distribution: 'constant', value: 0.4 });
    const chosen = [...targetsFor(topology, { seed: 3 })];

    expect(Math.max(...chosen)).toBeGreaterThan(18);
  });

  it('has nothing to link in a network with no pairs', () => {
    expect(
      targetsFor(density({ distribution: 'constant', value: 1 }), { nodes: 1 })
        .size,
    ).toBe(0);
  });
});
