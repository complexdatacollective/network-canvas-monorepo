import { describe, expect, test } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import {
  computeLayoutMetrics,
  type LayoutDimensions,
} from '../layoutDimensions';
import { lineOwnersOf } from '../lineOwners';
import {
  buildConnectorData,
  drawPedigree,
  pedigreeLayoutToPositions,
  toPedigreeInput,
} from '../pedigreeAdapter';
import type { PedigreeEdgeType, PedigreeLink, PedigreeLayout } from '../types';
import { areConsanguineous, relativeRaisers } from '../utils';

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

  test('keeps a gestational carrier’s tie as recorded, and draws the line of descent from her when the child has no other parent', () => {
    // Donor-conceived child carried by a gestational carrier ("single parent,
    // two donors"). Per NSGC nomenclature the child descends from the
    // carrier; the donors draw lines of their own.
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

    expect(carrierConn?.edgeType).toBe('surrogate');
    expect(eggConn?.edgeType).toBe('donor');
    const { descent, lines } = lineOwnersOf(input.parents, [])[
      idToIndex.get('child')!
    ]!;
    expect(descent).toStrictEqual({
      parents: [idToIndex.get('carrier')!],
      kind: 'surrogate',
    });
    expect(lines.map((line) => line.kind)).toStrictEqual(['donor', 'donor']);
  });

  test('a carrier the line of descent comes from gave the child no genes', () => {
    // The surrogate's own child and the child she carried for donors are
    // partners. The surrogacy child descends from her, but they share no
    // genetic ancestor, so their partnership is not consanguineous.
    const nodes = makeNodes([
      { id: 'carrier' },
      { id: 'carriersPartner' },
      { id: 'ownChild' },
      { id: 'eggDonor' },
      { id: 'spermDonor' },
      { id: 'surrogacyChild' },
    ]);
    const edges = makeEdges([
      { from: 'carrier', to: 'carriersPartner', relationshipType: 'partner' },
      { from: 'carrier', to: 'ownChild', relationshipType: 'biological' },
      {
        from: 'carriersPartner',
        to: 'ownChild',
        relationshipType: 'biological',
      },
      { from: 'eggDonor', to: 'surrogacyChild', relationshipType: 'donor' },
      { from: 'spermDonor', to: 'surrogacyChild', relationshipType: 'donor' },
      {
        from: 'carrier',
        to: 'surrogacyChild',
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
      { from: 'ownChild', to: 'surrogacyChild', relationshipType: 'partner' },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const index = (id: string) => idToIndex.get(id)!;
    const carried = input.parents[index('surrogacyChild')]!.find(
      (p) => p.parentIndex === index('carrier'),
    );
    expect(carried?.edgeType).toBe('surrogate');
    expect(
      areConsanguineous(
        index('ownChild'),
        index('surrogacyChild'),
        input.parents,
      ),
    ).toBe(false);
  });

  test('an adopted child’s birth parent keeps their recorded tie, and gave them genes', () => {
    const nodes = makeNodes([
      { id: 'birthMum' },
      { id: 'adoptiveMum' },
      { id: 'adopted' },
      { id: 'birthSibling' },
      { id: 'otherParent' },
    ]);
    const edges = makeEdges([
      { from: 'birthMum', to: 'adopted', relationshipType: 'biological' },
      { from: 'adoptiveMum', to: 'adopted', relationshipType: 'adoptive' },
      { from: 'birthMum', to: 'birthSibling', relationshipType: 'biological' },
      {
        from: 'otherParent',
        to: 'birthSibling',
        relationshipType: 'biological',
      },
      { from: 'adopted', to: 'birthSibling', relationshipType: 'partner' },
    ]);

    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const index = (id: string) => idToIndex.get(id)!;
    expect(
      input.parents[index('adopted')]!.find(
        (p) => p.parentIndex === index('birthMum'),
      )?.edgeType,
    ).toBe('biological');
    expect(
      areConsanguineous(index('adopted'), index('birthSibling'), input.parents),
    ).toBe(true);
  });

  test('the layout and the adapter find the same relatives raising a child, whichever line a carrier is drawn with', () => {
    // Kit's birth parent is Bea; Bea's sister Ann and Cal adopt Kit. Cal is
    // the own child of a carrier who carried a child for donors, and that
    // child is the partner of Bea's father. The carrier's line to the child
    // she carried is drawn solid, but it is no genetic tie, so Cal is no
    // relative of Kit's birth family.
    const nodes = makeNodes([
      { id: 'grandad' },
      { id: 'bea' },
      { id: 'ann' },
      { id: 'kit' },
      { id: 'carrier' },
      { id: 'cal' },
      { id: 'eggDonor' },
      { id: 'spermDonor' },
      { id: 'carried' },
    ]);
    const edges = makeEdges([
      { from: 'grandad', to: 'bea', relationshipType: 'biological' },
      { from: 'grandad', to: 'ann', relationshipType: 'biological' },
      { from: 'bea', to: 'kit', relationshipType: 'biological' },
      { from: 'ann', to: 'kit', relationshipType: 'adoptive' },
      { from: 'cal', to: 'kit', relationshipType: 'adoptive' },
      { from: 'carrier', to: 'cal', relationshipType: 'biological' },
      { from: 'eggDonor', to: 'carried', relationshipType: 'donor' },
      { from: 'spermDonor', to: 'carried', relationshipType: 'donor' },
      {
        from: 'carrier',
        to: 'carried',
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
      { from: 'carried', to: 'grandad', relationshipType: 'partner' },
    ]);
    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const index = (id: string) => idToIndex.get(id)!;
    const raisers = relativeRaisers(input.parents, input.partners);
    expect([...raisers[index('kit')]!]).toEqual([index('ann')]);
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

  test('keeps a birth parent outside the adoptive family as recorded, the line of descent coming from the adopters', () => {
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
    expect(cara?.edgeType).toBe('biological');
    const { descent, lines } = lineOwnersOf(
      input.parents,
      input.partners ?? [],
    )[idToIndex.get('child')!]!;
    expect(descent?.parents.toSorted((a, b) => a - b)).toStrictEqual(
      [idToIndex.get('ann')!, idToIndex.get('bob')!].toSorted((a, b) => a - b),
    );
    expect(lines).toStrictEqual([
      { parents: [idToIndex.get('cara')!], kind: 'biological' },
    ]);
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

describe('who carried the pregnancy (Round 5, Josh, 12 Oct 2026)', () => {
  // Whether a tie is a birth tie, and who carried, are read from the tie's
  // kind and its carried flag in one place; every reader sees the same.
  const ownersOf = (nodes: string[], edges: PedigreeLink[], child: string) => {
    const { input, idToIndex } = toPedigreeInput(nodes, edges);
    const owners = lineOwnersOf(input.parents, input.partners ?? [])[
      idToIndex.get(child)!
    ]!;
    const name = (index: number) => nodes[index]!;
    return {
      descent: owners.descent?.parents.map(name),
      descentKind: owners.descent?.kind,
      lines: owners.lines.map((line) => ({
        parents: line.parents.map(name),
        kind: line.kind,
      })),
    };
  };

  test('a donor who carried the child (a traditional surrogate) is their carrier, and with no one else, their line of descent', () => {
    const edges = makeEdges([
      {
        from: 'donor',
        to: 'child',
        relationshipType: 'donor',
        isGestationalCarrier: true,
      },
    ]);
    expect(ownersOf(['donor', 'child'], edges, 'child').descent).toEqual([
      'donor',
    ]);
  });

  test('the line of descent comes from whoever carried the child, not the biological couple (Bennett 3)', () => {
    const edges = makeEdges([
      { from: 'a', to: 'b', relationshipType: 'partner' },
      { from: 'a', to: 'p', relationshipType: 'biological' },
      { from: 'b', to: 'p', relationshipType: 'biological' },
      {
        from: 's',
        to: 'p',
        relationshipType: 'surrogate',
        isGestationalCarrier: true,
      },
    ]);
    const owners = ownersOf(['a', 'b', 's', 'p'], edges, 'p');
    expect(owners.descent).toEqual(['s']);
    expect(owners.lines).toEqual([{ parents: ['a', 'b'], kind: 'biological' }]);
  });

  test('a donor who carried owns the line of descent; the biological father and his partner draw lines of their own (Bennett 4a)', () => {
    const edges = makeEdges([
      { from: 'man', to: 'woman', relationshipType: 'partner' },
      { from: 'man', to: 'p', relationshipType: 'biological' },
      { from: 'woman', to: 'p', relationshipType: 'social' },
      {
        from: 'd',
        to: 'p',
        relationshipType: 'donor',
        isGestationalCarrier: true,
      },
    ]);
    const owners = ownersOf(['man', 'woman', 'd', 'p'], edges, 'p');
    expect(owners.descent).toEqual(['d']);
    expect(owners.lines).toEqual([
      { parents: ['man'], kind: 'biological' },
      { parents: ['woman'], kind: 'social' },
    ]);
  });

  test('a carrier partnered with the other genetic parent shares the line of descent with them, solid (Bennett 2 and 5)', () => {
    const edges = makeEdges([
      { from: 'man', to: 'woman', relationshipType: 'partner' },
      { from: 'man', to: 'p', relationshipType: 'biological' },
      {
        from: 'woman',
        to: 'p',
        relationshipType: 'social',
        isGestationalCarrier: true,
      },
      { from: 'd', to: 'p', relationshipType: 'donor' },
    ]);
    const owners = ownersOf(['man', 'woman', 'd', 'p'], edges, 'p');
    expect(owners.descent?.toSorted()).toEqual(['man', 'woman']);
    expect(owners.descentKind).toBe('biological');
    expect(owners.lines).toEqual([{ parents: ['d'], kind: 'donor' }]);
  });

  test('a parent who raises the child and carried them holds a birth tie, drawn solid; a partner who only raises keeps a dashed line (Bennett 1f)', () => {
    const edges = makeEdges([
      { from: 'woman', to: 'man', relationshipType: 'partner' },
      {
        from: 'woman',
        to: 'p',
        relationshipType: 'social',
        isGestationalCarrier: true,
      },
      { from: 'man', to: 'p', relationshipType: 'social' },
      { from: 'eggD', to: 'p', relationshipType: 'donor' },
      { from: 'spermD', to: 'p', relationshipType: 'donor' },
    ]);
    const owners = ownersOf(
      ['woman', 'man', 'eggD', 'spermD', 'p'],
      edges,
      'p',
    );
    expect(owners.descent).toEqual(['woman']);
    expect(owners.descentKind).not.toBe('social');
    expect(owners.lines).toContainEqual({ parents: ['man'], kind: 'social' });
  });

  test('the line of descent a parent shares between a child they raise and a child they carried is drawn solid', () => {
    // Pat raises Ann (a social tie) and carried Ben (a social tie with the
    // carried flag): one sibship, one line of descent from Pat.
    const nodes = ['pat', 'ann', 'ben'];
    const links: PedigreeLink[] = [
      { source: 'pat', target: 'ann', kind: 'social' },
      {
        source: 'pat',
        target: 'ben',
        kind: 'social',
        isGestationalCarrier: true,
      },
    ];
    const { connectorData } = drawPedigree({
      nodeIds: nodes,
      links,
      dimensions: TEST_DIMENSIONS,
    });
    const withLink = connectorData.connectors.parentChildLines.filter(
      (line) => line.parentLink.length > 0,
    );
    expect(withLink).toHaveLength(1);
    expect(['biological', 'donor', 'surrogate']).toContain(
      withLink[0]!.edgeType,
    );
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
