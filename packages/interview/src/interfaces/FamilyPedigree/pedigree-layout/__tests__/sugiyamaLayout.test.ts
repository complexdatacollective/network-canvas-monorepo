import { describe, expect, it } from 'vitest';

import {
  buildPedigreeGraph,
  countCrossings,
  minimizeCrossings,
  sugiyamaLayout,
} from '../sugiyamaLayout';
import {
  consanguineousUnion,
  dualAuxiliary,
  multipleMarriages,
  nuclearFamily,
  remarriedParentWithSibling,
  singleParent,
  surrogacyFamily,
  surrogacyWithSibling,
  threeGeneration,
  twinFamily,
  twoSibshipIntermarriage,
  unrelatedCouple,
} from './fixtures';

describe('buildPedigreeGraph', () => {
  it('nuclear family: 2 parents + 3 children', () => {
    const graph = buildPedigreeGraph(nuclearFamily);

    expect(graph.nodeCount).toBe(5);
    expect(graph.partnerGroups).toHaveLength(1);
    expect(graph.partnerGroups[0]!.members).toEqual([0, 1]);
    expect(graph.familyUnits).toHaveLength(1);
    expect(graph.familyUnits[0]!.children).toEqual([2, 3, 4]);
    expect(graph.siblingGroups).toHaveLength(1);
    expect(graph.siblingGroups[0]!.members).toEqual([2, 3, 4]);

    const uniqueLayers = new Set(graph.layers);
    expect(uniqueLayers.size).toBe(2);

    expect(graph.layers[0]).toBe(graph.layers[1]);
    expect(graph.layers[2]).toBeGreaterThan(graph.layers[0]!);
  });

  it('three generation pedigree', () => {
    const graph = buildPedigreeGraph(threeGeneration);

    expect(graph.partnerGroups).toHaveLength(2);
    expect(graph.familyUnits).toHaveLength(2);

    const uniqueLayers = new Set(graph.layers);
    expect(uniqueLayers.size).toBe(3);

    expect(graph.layers[0]).toBe(graph.layers[1]);
    expect(graph.layers[2]).toBeGreaterThan(graph.layers[0]!);
    expect(graph.layers[4]).toBeGreaterThan(graph.layers[2]!);
  });

  it('surrogacy family: social parents + surrogate as auxiliary', () => {
    const graph = buildPedigreeGraph(surrogacyFamily);

    expect(graph.partnerGroups).toHaveLength(1);
    expect(graph.partnerGroups[0]!.members).toEqual([0, 1]);

    expect(graph.auxiliaryParents.has(3)).toBe(true);
    expect(graph.auxiliaryParents.get(3)).toEqual([2]);

    expect(graph.parentEdgeTypes.get('2-3')).toBe('surrogate');
    expect(graph.parentEdgeTypes.get('0-3')).toBe('biological');

    expect(graph.layers[2]).toBe(graph.layers[0]);
  });

  it('single parent: 1 parent + 1 child', () => {
    const graph = buildPedigreeGraph(singleParent);

    expect(graph.nodeCount).toBe(2);
    expect(graph.partnerGroups).toHaveLength(0);
    expect(graph.familyUnits).toHaveLength(1);
    expect(graph.familyUnits[0]!.parentGroup.members).toEqual([0]);
    expect(graph.familyUnits[0]!.children).toEqual([1]);

    const uniqueLayers = new Set(graph.layers);
    expect(uniqueLayers.size).toBe(2);
  });

  it('multiple marriages: person 0 with partners 1 and 2', () => {
    const graph = buildPedigreeGraph(multipleMarriages);

    expect(graph.partnerGroups).toHaveLength(2);
    const groupKeys = graph.partnerGroups
      .map((g) => g.members.join(','))
      .toSorted();
    expect(groupKeys).toEqual(['0,1', '0,2']);

    expect(graph.familyUnits).toHaveLength(2);

    const fu1 = graph.familyUnits.find((fu) =>
      fu.parentGroup.members.includes(1),
    );
    const fu2 = graph.familyUnits.find((fu) =>
      fu.parentGroup.members.includes(2),
    );
    expect(fu1!.children).toEqual([3]);
    expect(fu2!.children).toEqual([4]);
  });

  it('stores parents on the graph', () => {
    const graph = buildPedigreeGraph(nuclearFamily);
    expect(graph.parents).toBe(nuclearFamily.parents);
  });
});

describe('minimizeCrossings', () => {
  it('nuclear family has 0 crossings', () => {
    const graph = buildPedigreeGraph(nuclearFamily);
    const ordering = minimizeCrossings(graph);
    const crossings = countCrossings(ordering, graph);
    expect(crossings).toBe(0);
  });

  it('reduces crossings from a bad initial ordering', () => {
    const graph = buildPedigreeGraph(nuclearFamily);

    // Manually create a bad ordering: reverse children so edges cross
    const maxLayer = Math.max(...graph.layers);
    const badOrdering: number[][] = [];
    for (let layer = 0; layer <= maxLayer; layer++) {
      const nodes: number[] = [];
      for (let i = 0; i < graph.nodeCount; i++) {
        if (graph.layers[i] === layer) nodes.push(i);
      }
      badOrdering.push(nodes.toReversed());
    }

    const badCrossings = countCrossings(badOrdering, graph);
    const goodOrdering = minimizeCrossings(graph);
    const goodCrossings = countCrossings(goodOrdering, graph);

    expect(goodCrossings).toBeLessThanOrEqual(badCrossings);
  });

  it('partner groups stay contiguous after minimization', () => {
    const graph = buildPedigreeGraph(multipleMarriages);
    const ordering = minimizeCrossings(graph);

    for (const pg of graph.partnerGroups) {
      const layer = graph.layers[pg.members[0]!]!;
      const layerOrdering = ordering[layer]!;
      const positions = pg.members.map((m) => layerOrdering.indexOf(m));
      positions.sort((a, b) => a - b);

      // All members must be at consecutive positions
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBe(1);
      }
    }
  });

  it('keeps both marriages of a remarried sibling contiguous', () => {
    // A sibling who anchors two marriages must sit between her spouses; a
    // grouping that pushes both spouses to one side leaves the far spouse
    // non-adjacent and silently drops that marriage line.
    const graph = buildPedigreeGraph(remarriedParentWithSibling);
    const ordering = minimizeCrossings(graph);

    for (const pg of graph.partnerGroups) {
      const layer = graph.layers[pg.members[0]!]!;
      const layerOrdering = ordering[layer]!;
      const positions = pg.members
        .map((m) => layerOrdering.indexOf(m))
        .toSorted((a, b) => a - b);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBe(1);
      }
    }
  });

  it('sibling groups stay contiguous after minimization', () => {
    const graph = buildPedigreeGraph(nuclearFamily);
    const ordering = minimizeCrossings(graph);

    for (const sg of graph.siblingGroups) {
      const layer = graph.layers[sg.members[0]!]!;
      const layerOrdering = ordering[layer]!;
      const positions = sg.members.map((m) => layerOrdering.indexOf(m));
      positions.sort((a, b) => a - b);

      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBe(1);
      }
    }
  });

  it('three-generation pedigree has correct layer assignments', () => {
    const graph = buildPedigreeGraph(threeGeneration);
    const ordering = minimizeCrossings(graph);

    expect(ordering.length).toBe(4);

    // Layer 0 is empty (layers are 1-based from kindepth+1)
    // Layer 1: grandparents (0, 1)
    // Layer 2: parents (2, 3)
    // Layer 3: child (4)
    const layer1 = ordering[1];
    const layer2 = ordering[2];
    const layer3 = ordering[3];

    expect(new Set(layer1)).toEqual(new Set([0, 1]));
    expect(new Set(layer2)).toEqual(new Set([2, 3]));
    expect(new Set(layer3)).toEqual(new Set([4]));

    const crossings = countCrossings(ordering, graph);
    expect(crossings).toBe(0);
  });

  it('reflects a frozen sibship block to reach the mirror orientation', () => {
    // Two intermarrying sibships form ONE gen-II block whose couples' left/right
    // orientation is frozen by ascending node index. The barycentric sweeps only
    // reorder whole blocks, never reflect one, so without the block-reversal pass
    // this ordering keeps a spurious crossing (2). The reflection pass reaches the
    // mirror orientation that removes it.
    const graph = buildPedigreeGraph(twoSibshipIntermarriage);
    const ordering = minimizeCrossings(graph);

    expect(countCrossings(ordering, graph)).toBe(0);

    // In the mirror orientation each cousin descends directly under its own
    // parent couple, so the two cousins appear in the SAME left-to-right order as
    // their respective sibship halves — no descent line crosses.
    const genII = ordering[2]!; // sibA, spA, sibB, spB (some order)
    const genIII = ordering[3]!; // cousinA(6), cousinB(7), extraA(8)
    const colGenII = (node: number) => genII.indexOf(node);
    const colGenIII = (node: number) => genIII.indexOf(node);

    // Couple A = {sibA(2), spA(4)} → cousinA(6); Couple B = {sibB(3), spB(5)} →
    // cousinB(7). The couple that sits left must own the left cousin.
    const coupleAMid = (colGenII(2) + colGenII(4)) / 2;
    const coupleBMid = (colGenII(3) + colGenII(5)) / 2;
    const cousinAOnLeft = coupleAMid < coupleBMid;
    expect(colGenIII(6) < colGenIII(7)).toBe(cousinAOnLeft);

    // The block stays contiguous through the reflection: each couple's two
    // members remain adjacent.
    expect(Math.abs(colGenII(2) - colGenII(4))).toBe(1);
    expect(Math.abs(colGenII(3) - colGenII(5))).toBe(1);
  });

  it('seats a surrogate/donor parent adjacent to its couple (own block)', () => {
    // surrogacyFamily: parent1(0) + parent2(1) form the couple; surrogate(2)
    // contributes to child(3). The surrogate must sit beside the couple.
    const graph = buildPedigreeGraph(surrogacyFamily);
    const ordering = minimizeCrossings(graph);

    const parentLayer = graph.layers[0]!;
    const row = ordering[parentLayer]!;
    const col = (node: number) => row.indexOf(node);

    const gapToCouple = Math.min(
      Math.abs(col(2) - col(0)),
      Math.abs(col(2) - col(1)),
    );
    expect(gapToCouple).toBe(1);
  });

  it('seats a surrogate adjacent to a couple embedded in a sibship block', () => {
    // surrogacyWithSibling: dad(2) + mom(4) are the couple; dad is one of a
    // dad/uncle sibship, so the couple is embedded in a sibship block rather than
    // being its own block. The surrogate(5) must still land beside the couple,
    // not at the far end of the sibship.
    const graph = buildPedigreeGraph(surrogacyWithSibling);
    const ordering = minimizeCrossings(graph);

    const coupleLayer = graph.layers[2]!;
    const row = ordering[coupleLayer]!;
    const col = (node: number) => row.indexOf(node);

    const gapToCouple = Math.min(
      Math.abs(col(5) - col(2)),
      Math.abs(col(5) - col(4)),
    );
    expect(gapToCouple).toBe(1);
  });

  it('seats two auxiliary parents (donor + surrogate) both adjacent to the couple', () => {
    // dualAuxiliary: mom(0) + dad(1) are the couple; donor(2) and surrogate(3)
    // both contribute to child(4). Both auxiliaries must land beside the couple
    // (one on each side), not drift away.
    const graph = buildPedigreeGraph(dualAuxiliary);
    const ordering = minimizeCrossings(graph);
    const coupleLayer = graph.layers[0]!;
    const row = ordering[coupleLayer]!;
    const col = (node: number) => row.indexOf(node);
    const gapTo = (aux: number) =>
      Math.min(Math.abs(col(aux) - col(0)), Math.abs(col(aux) - col(1)));
    expect(gapTo(2)).toBe(1); // donor adjacent to the couple
    expect(gapTo(3)).toBe(1); // surrogate adjacent to the couple
  });
});

describe('sugiyamaLayout (output encoding)', () => {
  it('nuclear family produces valid PedigreeLayout with 2 levels', () => {
    const result = sugiyamaLayout(nuclearFamily);

    const activeLevels = result.n.filter((v) => v > 0);
    expect(activeLevels.length).toBe(2);

    const allIds = result.nid.flat();
    for (let i = 0; i < 5; i++) {
      expect(allIds).toContain(i);
    }

    // Positions strictly increasing within each active layer
    for (let layer = 0; layer < result.n.length; layer++) {
      const count = result.n[layer]!;
      if (count <= 1) continue;
      for (let col = 0; col < count - 1; col++) {
        expect(result.pos[layer]![col + 1]!).toBeGreaterThan(
          result.pos[layer]![col]!,
        );
      }
    }
  });

  it('fam pointers are non-zero for children in nuclear family', () => {
    const result = sugiyamaLayout(nuclearFamily);

    const parentLevIdx = result.n.findIndex((v) => v > 0);
    const childLevIdx = result.n.findIndex((v, i) => v > 0 && i > parentLevIdx);

    const childFams = result.fam[childLevIdx]!.slice(0, result.n[childLevIdx]);
    for (const f of childFams) {
      expect(f).toBeGreaterThan(0);
    }

    // All children share the same fam value
    const uniqueFams = [...new Set(childFams)];
    expect(uniqueFams.length).toBe(1);
  });

  it('group markers present between parent pair', () => {
    const result = sugiyamaLayout(nuclearFamily);
    const hasGroup = result.group.some((row) => row.some((v) => v > 0));
    expect(hasGroup).toBe(true);
  });

  it('groupMember detects married-in founders', () => {
    // In threeGeneration, parent2 (index 3) is a founder who married into the family
    const result = sugiyamaLayout(threeGeneration);

    const loc3 = findNodeLocation(result, 3);
    expect(loc3).not.toBeNull();
    expect(result.groupMember[loc3!.layer]![loc3!.col]).toBe(true);
  });

  it('twins detection produces non-null twins with MZ code', () => {
    const result = sugiyamaLayout(twinFamily);
    expect(result.twins).not.toBeNull();

    // Find a cell with code 1 (MZ)
    const hasMZ = result.twins!.some((row) => row.some((v) => v === 1));
    expect(hasMZ).toBe(true);
  });
});

describe('consanguinity detection (group encoding)', () => {
  it('marks a partner pair that shares an ancestor with group 2', () => {
    const result = sugiyamaLayout(consanguineousUnion);

    // ego(4) and cousin(5) are partners who share grandparents {0,1}.
    const group = partnerPairGroup(result, 4, 5);
    expect(group).toBe(2);
  });

  it('marks an unrelated partner pair with group 1', () => {
    const result = sugiyamaLayout(unrelatedCouple);

    // personA(0) and personB(1) share no ancestors.
    const group = partnerPairGroup(result, 0, 1);
    expect(group).toBe(1);
  });
});

/**
 * Reads the group marker for the partner pair (nodeA, nodeB) from a layout.
 * The marker is stored at group[layer][col] of the left member of an adjacent
 * partner pair, so the two nodes must be neighbours on the same layer.
 */
function partnerPairGroup(
  layout: { n: number[]; nid: number[][]; group: number[][] },
  nodeA: number,
  nodeB: number,
): number | null {
  for (let layer = 0; layer < layout.n.length; layer++) {
    for (let col = 0; col < layout.n[layer]! - 1; col++) {
      const left = layout.nid[layer]![col]!;
      const right = layout.nid[layer]![col + 1]!;
      const isPair =
        (left === nodeA && right === nodeB) ||
        (left === nodeB && right === nodeA);
      if (isPair) {
        return layout.group[layer]![col]!;
      }
    }
  }
  return null;
}

function findNodeLocation(
  layout: { n: number[]; nid: number[][] },
  node: number,
): { layer: number; col: number } | null {
  for (let layer = 0; layer < layout.n.length; layer++) {
    for (let col = 0; col < layout.n[layer]!; col++) {
      if (layout.nid[layer]![col] === node) {
        return { layer, col };
      }
    }
  }
  return null;
}
