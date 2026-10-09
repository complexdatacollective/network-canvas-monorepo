import { describe, expect, test } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import {
  computeLayoutMetrics,
  type LayoutDimensions,
} from '../layoutDimensions';
import {
  buildConnectorData,
  pedigreeLayoutToPositions,
  toPedigreeInput,
} from '../pedigreeAdapter';
import type { PedigreeEdgeType, PedigreeLink, PedigreeLayout } from '../types';

const TEST_DIMENSIONS: LayoutDimensions = {
  nodeWidth: 100,
  nodeHeight: 100,
};

function makeNodes(entries: { id: string; isEgo?: boolean }[]): string[] {
  return entries.map(({ id }) => id);
}

function makeEdges(
  entries: {
    from: string;
    to: string;
    relationshipType: string;
    isActive?: boolean;
    isGestationalCarrier?: boolean;
  }[],
): PedigreeLink[] {
  return entries.map((e) => ({
    source: e.from,
    target: e.to,
    kind: e.relationshipType as PedigreeEdgeType,
    isActive: e.isActive ?? true,
    isGestationalCarrier: e.isGestationalCarrier ?? false,
  }));
}

describe('toPedigreeInput', () => {
  test('empty graph produces empty input', () => {
    const { input } = toPedigreeInput([], []);
    expect(input.id).toHaveLength(0);
    expect(input.parents).toHaveLength(0);
  });

  test('single node produces correct single-element arrays', () => {
    const nodes = makeNodes([{ id: 'ego', isEgo: true }]);
    const { input, indexToId, idToIndex } = toPedigreeInput(nodes, []);

    expect(input.id).toEqual(['ego']);
    expect(input.parents).toEqual([[]]);
    expect(indexToId).toEqual(['ego']);
    expect(idToIndex.get('ego')).toBe(0);
  });

  test('nuclear family produces correct parent connections from edges', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'child', relationshipType: 'biological' },
      { from: 'mother', to: 'child', relationshipType: 'biological' },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);

    const childIdx = idToIndex.get('child')!;
    const fatherIdx = idToIndex.get('father')!;
    const motherIdx = idToIndex.get('mother')!;

    expect(input.parents[childIdx]).toHaveLength(2);
    const parentIndices = input.parents[childIdx]!.map((p) => p.parentIndex);
    expect(parentIndices).toContain(fatherIdx);
    expect(parentIndices).toContain(motherIdx);

    expect(input.parents[fatherIdx]).toHaveLength(0);
    expect(input.parents[motherIdx]).toHaveLength(0);
  });

  test('promotes the gestational carrier to a primary parent when the child has no primary parent', () => {
    // Donor-conceived child carried by a gestational carrier ("single parent,
    // two donors"). Per NSGC nomenclature the child descends from the carrier;
    // the carrier's edge is promoted so it anchors the line of descent.
    const nodes = makeNodes([
      { id: 'eggDonor' },
      { id: 'spermDonor' },
      { id: 'carrier' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'eggDonor', to: 'child', relationshipType: 'donor' },
      { from: 'spermDonor', to: 'child', relationshipType: 'donor' },
      {
        from: 'carrier',
        to: 'child',
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const childParents = input.parents[idToIndex.get('child')!]!;
    const carrierConn = childParents.find(
      (p) => p.parentIndex === idToIndex.get('carrier')!,
    );
    const eggConn = childParents.find(
      (p) => p.parentIndex === idToIndex.get('eggDonor')!,
    );

    // The promoted edge is a primary one the renderer draws solid, never
    // 'social', which it dashes.
    expect(carrierConn?.edgeType).toBe('biological');
    expect(eggConn?.edgeType).toBe('donor');
  });

  test('keeps a birth parent who is the adoptive parent’s partner as a biological parent', () => {
    // A step-parent adoption: Karen gave birth to the child and raises them
    // with Steve, her partner, who adopted the child.
    const edges = makeEdges([
      {
        from: 'karen',
        to: 'child',
        relationshipType: 'biological',
        isGestationalCarrier: true,
      },
      { from: 'steve', to: 'child', relationshipType: 'adoptive' },
      { from: 'karen', to: 'steve', relationshipType: 'partner' },
    ]);
    const { input, idToIndex } = toPedigreeInput(
      ['karen', 'steve', 'child'],
      edges,
    );
    const typeFrom = (parent: string) =>
      input.parents[idToIndex.get('child')!]!.find(
        (p) => p.parentIndex === idToIndex.get(parent),
      )?.edgeType;
    expect(typeFrom('karen')).toBe('biological');
    expect(typeFrom('steve')).toBe('adoptive');
  });

  test('draws a birth parent outside the adoptive family as a donor', () => {
    const edges = makeEdges([
      { from: 'ann', to: 'child', relationshipType: 'adoptive' },
      { from: 'bob', to: 'child', relationshipType: 'adoptive' },
      { from: 'ann', to: 'bob', relationshipType: 'partner' },
      {
        from: 'cara',
        to: 'child',
        relationshipType: 'biological',
        isGestationalCarrier: true,
      },
    ]);
    const { input, idToIndex } = toPedigreeInput(
      ['ann', 'bob', 'cara', 'child'],
      edges,
    );
    const cara = input.parents[idToIndex.get('child')!]!.find(
      (p) => p.parentIndex === idToIndex.get('cara'),
    );
    expect(cara?.edgeType).toBe('donor');
  });

  test('leaves the surrogate auxiliary when the child also has a primary parent', () => {
    const nodes = makeNodes([
      { id: 'mum' },
      { id: 'dad' },
      { id: 'surr' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'mum', to: 'child', relationshipType: 'biological' },
      { from: 'dad', to: 'child', relationshipType: 'biological' },
      {
        from: 'surr',
        to: 'child',
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const surrConn = input.parents[idToIndex.get('child')!]!.find(
      (p) => p.parentIndex === idToIndex.get('surr')!,
    );
    expect(surrConn?.edgeType).toBe('surrogate');
  });

  test('three-generation pedigree produces correct indexing', () => {
    const nodes = makeNodes([
      { id: 'gf' },
      { id: 'gm' },
      { id: 'father' },
      { id: 'mother' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'gf', to: 'gm', relationshipType: 'partner' },
      { from: 'gf', to: 'father', relationshipType: 'biological' },
      { from: 'gm', to: 'father', relationshipType: 'biological' },
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'child', relationshipType: 'biological' },
      { from: 'mother', to: 'child', relationshipType: 'biological' },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);

    const fatherIdx = idToIndex.get('father')!;
    const gfIdx = idToIndex.get('gf')!;
    const gmIdx = idToIndex.get('gm')!;

    const fatherParentIndices = input.parents[fatherIdx]!.map(
      (p) => p.parentIndex,
    );
    expect(fatherParentIndices).toContain(gfIdx);
    expect(fatherParentIndices).toContain(gmIdx);

    const childIdx = idToIndex.get('child')!;
    const childParentIndices = input.parents[childIdx]!.map(
      (p) => p.parentIndex,
    );
    expect(childParentIndices).toContain(fatherIdx);
    expect(childParentIndices).toContain(idToIndex.get('mother')!);
  });

  test('partner edges produce Relation entries with code 4', () => {
    const nodes = makeNodes([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const edges = makeEdges([
      { from: 'a', to: 'b', relationshipType: 'partner' },
      { from: 'a', to: 'c', relationshipType: 'partner' },
    ]);

    const { input } = toPedigreeInput(nodes, edges);

    expect(input.relation).toHaveLength(2);
    expect(input.relation![0]!.code).toBe(4);
    expect(input.relation![1]!.code).toBe(4);
  });

  test('single parent produces one parent connection', () => {
    const nodes = makeNodes([{ id: 'parent' }, { id: 'child' }]);
    const edges = makeEdges([
      { from: 'parent', to: 'child', relationshipType: 'biological' },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const childIdx = idToIndex.get('child')!;

    expect(input.parents[childIdx]).toHaveLength(1);
    expect(input.parents[childIdx]![0]!.parentIndex).toBe(
      idToIndex.get('parent')!,
    );
  });

  test('passes ParentEdgeType straight through without translation', () => {
    const nodes = makeNodes([
      { id: 'sp' },
      { id: 'donor' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'sp', to: 'child', relationshipType: 'biological' },
      { from: 'donor', to: 'child', relationshipType: 'donor' },
    ]);

    const result = toPedigreeInput(nodes, edges);
    const childIdx = result.idToIndex.get('child')!;
    const edgeTypes = result.input.parents[childIdx]!.map((p) => p.edgeType);
    expect(edgeTypes).toContain('biological');
    expect(edgeTypes).toContain('donor');
  });
});

describe('pedigreeLayoutToPositions', () => {
  test('converts positions using siblingSpacing and rowHeight', () => {
    const layout: PedigreeLayout = {
      n: [2],
      nid: [[0, 1]],
      pos: [[0, 2.5]],
      fam: [[0, 0]],
      group: [[0, 0]],
      twins: null,
      groupMember: [[false, false]],
    };

    const positions = pedigreeLayoutToPositions(
      layout,
      ['a', 'b'],
      TEST_DIMENSIONS,
    );

    const posA = positions.get('a')!;
    const posB = positions.get('b')!;
    expect(posA.x).toBe(0);
    expect(posA.y).toBe(0);
    expect(posB.x).toBe(
      2.5 * computeLayoutMetrics(TEST_DIMENSIONS).siblingSpacing,
    );
    expect(posB.y).toBe(0);
  });

  test('normalizes so min x = 0', () => {
    const layout: PedigreeLayout = {
      n: [2],
      nid: [[0, 1]],
      pos: [[3, 5]],
      fam: [[0, 0]],
      group: [[0, 0]],
      twins: null,
      groupMember: [[false, false]],
    };

    const positions = pedigreeLayoutToPositions(
      layout,
      ['a', 'b'],
      TEST_DIMENSIONS,
    );

    const posA = positions.get('a')!;
    expect(posA.x).toBe(0);
    const posB = positions.get('b')!;
    expect(posB.x).toBe(
      2 * computeLayoutMetrics(TEST_DIMENSIONS).siblingSpacing,
    );
  });

  test('multi-generation layout uses rowHeight for y', () => {
    const layout: PedigreeLayout = {
      n: [1, 1],
      nid: [[0], [1]],
      pos: [[0], [0]],
      fam: [[0], [0]],
      group: [[0], [0]],
      twins: null,
      groupMember: [[false], [false]],
    };

    const positions = pedigreeLayoutToPositions(
      layout,
      ['parent', 'child'],
      TEST_DIMENSIONS,
    );

    expect(positions.get('parent')!.y).toBe(0);
    expect(positions.get('child')!.y).toBe(
      computeLayoutMetrics(TEST_DIMENSIONS).rowHeight,
    );
  });
});

describe('buildConnectorData', () => {
  test('produces connector data with pixel-space coordinates', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'child', relationshipType: 'biological' },
      { from: 'mother', to: 'child', relationshipType: 'biological' },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const { connectors } = buildConnectorData(
      layout,
      edges,
      TEST_DIMENSIONS,
      input.parents,
      idToIndex,
    );

    expect(connectors.groupLines.length).toBeGreaterThanOrEqual(1);
    expect(connectors.parentChildLines.length).toBeGreaterThanOrEqual(1);

    for (const gl of connectors.groupLines) {
      expect(gl.segment.x1).toBeGreaterThanOrEqual(0);
    }
  });

  test('renders one shared union and descent for partners from separate sibships', () => {
    const nodes = makeNodes([
      { id: 'gpA1' },
      { id: 'gpA2' },
      { id: 'gpB1' },
      { id: 'gpB2' },
      { id: 'sibA1' },
      { id: 'sibA2' },
      { id: 'sibA3' },
      { id: 'sibB1' },
      { id: 'sibB2' },
      { id: 'sibB3' },
      { id: 'ego', isEgo: true },
      { id: 'sibling' },
    ]);
    const edges = makeEdges([
      { from: 'gpA1', to: 'gpA2', relationshipType: 'partner' },
      { from: 'gpB1', to: 'gpB2', relationshipType: 'partner' },
      { from: 'gpA1', to: 'sibA1', relationshipType: 'biological' },
      { from: 'gpA2', to: 'sibA1', relationshipType: 'biological' },
      { from: 'gpA1', to: 'sibA2', relationshipType: 'biological' },
      { from: 'gpA2', to: 'sibA2', relationshipType: 'biological' },
      { from: 'gpA1', to: 'sibA3', relationshipType: 'biological' },
      { from: 'gpA2', to: 'sibA3', relationshipType: 'biological' },
      { from: 'gpB1', to: 'sibB1', relationshipType: 'biological' },
      { from: 'gpB2', to: 'sibB1', relationshipType: 'biological' },
      { from: 'gpB1', to: 'sibB2', relationshipType: 'biological' },
      { from: 'gpB2', to: 'sibB2', relationshipType: 'biological' },
      { from: 'gpB1', to: 'sibB3', relationshipType: 'biological' },
      { from: 'gpB2', to: 'sibB3', relationshipType: 'biological' },
      { from: 'sibA1', to: 'sibB1', relationshipType: 'partner' },
      { from: 'sibA1', to: 'ego', relationshipType: 'biological' },
      { from: 'sibB1', to: 'ego', relationshipType: 'biological' },
      { from: 'sibA1', to: 'sibling', relationshipType: 'biological' },
      { from: 'sibB1', to: 'sibling', relationshipType: 'biological' },
    ]);

    const { input, indexToId, idToIndex } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const { connectors } = buildConnectorData(
      layout,
      edges,
      TEST_DIMENSIONS,
      input.parents,
      idToIndex,
      undefined,
      indexToId,
    );
    const union = connectors.groupLines.find(
      (line) =>
        line.partnerIds?.includes('sibA1') && line.partnerIds.includes('sibB1'),
    );
    const descent = connectors.parentChildLines.find(
      (line) =>
        line.parentIds?.includes('sibA1') && line.parentIds.includes('sibB1'),
    );

    expect(union).toBeDefined();
    expect(union!.descentXPositions).toHaveLength(1);
    expect(union!.descentXPositions![0]).toBeCloseTo(
      (union!.segment.x1 + union!.segment.x2) / 2,
    );
    expect(descent).toBeDefined();
    expect(new Set(descent!.uplineChildIds)).toEqual(
      new Set(['ego', 'sibling']),
    );
  });

  test('preserves three explicit former partnerships that share one parent', () => {
    const nodes = makeNodes([
      { id: 'margaret' },
      { id: 'biologicalParent' },
      { id: 'melville' },
      { id: 'white' },
      { id: 'robert', isEgo: true },
    ]);
    const edges = makeEdges([
      {
        from: 'margaret',
        to: 'biologicalParent',
        relationshipType: 'partner',
        isActive: false,
      },
      {
        from: 'margaret',
        to: 'melville',
        relationshipType: 'partner',
        isActive: false,
      },
      {
        from: 'margaret',
        to: 'white',
        relationshipType: 'partner',
        isActive: false,
      },
      {
        from: 'margaret',
        to: 'robert',
        relationshipType: 'biological',
      },
      {
        from: 'biologicalParent',
        to: 'robert',
        relationshipType: 'biological',
      },
      { from: 'melville', to: 'robert', relationshipType: 'social' },
      { from: 'white', to: 'robert', relationshipType: 'social' },
    ]);

    const { input, indexToId, idToIndex } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const { connectors } = buildConnectorData(
      layout,
      edges,
      TEST_DIMENSIONS,
      input.parents,
      idToIndex,
      undefined,
      indexToId,
    );

    const partnershipPairs = connectors.groupLines
      .map((line) => line.partnerIds?.toSorted().join('|'))
      .filter((pair): pair is string => pair !== undefined)
      .toSorted();

    expect(partnershipPairs).toEqual([
      'biologicalParent|margaret',
      'margaret|melville',
      'margaret|white',
    ]);
    expect(connectors.groupLines.every((line) => !line.isActive)).toBe(true);
    expect(
      connectors.groupLines.filter(
        (line) => line.endpointSegments !== undefined,
      ),
    ).toHaveLength(1);

    const socialParentPairs = connectors.auxiliaryLines
      .filter((line) => line.edgeType === 'social')
      .map((line) => line.endpointIds?.filter(Boolean).toSorted().join('|'));
    expect(socialParentPairs).toContain('melville|robert');
    expect(socialParentPairs).toContain('robert|white');
  });
});

describe('end-to-end: store → layout → positions', () => {
  test('parents are above children (smaller y)', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'child', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'child', relationshipType: 'biological' },
      { from: 'mother', to: 'child', relationshipType: 'biological' },
    ]);

    const { input, indexToId } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const positions = pedigreeLayoutToPositions(
      layout,
      indexToId,
      TEST_DIMENSIONS,
    );

    expect(positions.get('father')!.y).toBeLessThan(positions.get('child')!.y);
    expect(positions.get('mother')!.y).toBeLessThan(positions.get('child')!.y);
  });

  test('partners are on same row (same y)', () => {
    const nodes = makeNodes([{ id: 'father' }, { id: 'mother' }]);
    const edges = makeEdges([
      { from: 'father', to: 'mother', relationshipType: 'partner' },
    ]);

    const { input, indexToId } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const positions = pedigreeLayoutToPositions(
      layout,
      indexToId,
      TEST_DIMENSIONS,
    );

    expect(positions.get('father')!.y).toBe(positions.get('mother')!.y);
  });

  test('siblings are on same row (same y)', () => {
    const nodes = makeNodes([
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
      { id: 'sibling' },
    ]);
    const edges = makeEdges([
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'ego', relationshipType: 'biological' },
      { from: 'mother', to: 'ego', relationshipType: 'biological' },
      { from: 'father', to: 'sibling', relationshipType: 'biological' },
      { from: 'mother', to: 'sibling', relationshipType: 'biological' },
    ]);

    const { input, indexToId } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const positions = pedigreeLayoutToPositions(
      layout,
      indexToId,
      TEST_DIMENSIONS,
    );

    expect(positions.get('ego')!.y).toBe(positions.get('sibling')!.y);
  });

  test('all nodes receive positions', () => {
    const nodes = makeNodes([
      { id: 'gf' },
      { id: 'gm' },
      { id: 'father' },
      { id: 'mother' },
      { id: 'ego', isEgo: true },
    ]);
    const edges = makeEdges([
      { from: 'gf', to: 'gm', relationshipType: 'partner' },
      { from: 'gf', to: 'father', relationshipType: 'biological' },
      { from: 'gm', to: 'father', relationshipType: 'biological' },
      { from: 'father', to: 'mother', relationshipType: 'partner' },
      { from: 'father', to: 'ego', relationshipType: 'biological' },
      { from: 'mother', to: 'ego', relationshipType: 'biological' },
    ]);

    const { input, indexToId } = toPedigreeInput(nodes, edges);
    const layout = alignPedigree(input);
    const positions = pedigreeLayoutToPositions(
      layout,
      indexToId,
      TEST_DIMENSIONS,
    );

    expect(positions.size).toBe(nodes.length);
    for (const nodeId of nodes) {
      expect(positions.has(nodeId)).toBe(true);
    }
  });
});
