import { describe, expect, it } from 'vitest';

import { alignPedigree } from '../alignPedigree';
import { computeConnectors } from '../connectors';
import type { ParentConnection, PedigreeInput, ScalingParams } from '../types';
import {
  blendedFamily,
  crossFamily,
  multipleMarriages,
  nuclearFamily,
  sameSeParents,
  singleParent,
  surrogacyFamily,
  threeCoParents,
  threeGeneration,
  twinFamily,
  wideFamily,
} from './fixtures';
import * as fixtures from './fixtures';

describe('alignPedigree', () => {
  it('lays out a nuclear family', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    // Should have 2 levels
    expect(result.n.filter((v) => v > 0).length).toBe(2);

    // All 5 people should appear in the layout
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    for (let i = 0; i < 5; i++) {
      expect(allIds).toContain(i);
    }
  });

  it('lays out a three-generation pedigree', () => {
    const result = alignPedigree(threeGeneration, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    // Should have 3 levels
    expect(result.n.filter((v) => v > 0).length).toBe(3);
  });

  it('produces non-overlapping positions on each level', () => {
    const result = alignPedigree(wideFamily, {
      hints: { order: [1, 2, 3, 4, 5, 6, 7] },
    });
    for (let lev = 0; lev < result.n.length; lev++) {
      const nn = result.n[lev]!;
      if (nn <= 1) continue;
      const positions = result.pos[lev]!.slice(0, nn);
      for (let j = 0; j < positions.length - 1; j++) {
        expect(positions[j + 1]!).toBeGreaterThan(positions[j]!);
      }
    }
  });

  it('marks parent groups', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    const hasGroup = result.group.some((row) => row.some((v) => v > 0));
    expect(hasGroup).toBe(true);
  });

  it('all positions are non-negative', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let j = 0; j < result.n[lev]!; j++) {
        // Allow tiny floating point errors from QP solver
        expect(result.pos[lev]![j]!).toBeGreaterThanOrEqual(-1e-10);
      }
    }
  });

  it('handles multiple marriages', () => {
    const result = alignPedigree(multipleMarriages, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(2);
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    expect(allIds.length).toBeGreaterThanOrEqual(5);
  });

  it('handles twin families', () => {
    const result = alignPedigree(twinFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(2);
    expect(result.twins).not.toBeNull();
  });

  it('lays out same-sex parents', () => {
    const result = alignPedigree(sameSeParents, {
      hints: { order: [1, 2, 3] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(2);
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    expect(allIds).toContain(0);
    expect(allIds).toContain(1);
    expect(allIds).toContain(2);
  });

  it('lays out single parent', () => {
    const result = alignPedigree(singleParent, {
      hints: { order: [1, 2] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(2);
  });

  it('does NOT throw when a person has only one parent', () => {
    expect(() =>
      alignPedigree(singleParent, { hints: { order: [1, 2] } }),
    ).not.toThrow();
  });

  it('lays out three co-parents', () => {
    const result = alignPedigree(threeCoParents, {
      hints: { order: [1, 2, 3, 4] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(2);
  });

  it('three co-parents have minimum spacing of 1', () => {
    const result = alignPedigree(threeCoParents, {
      hints: { order: [1, 2, 3, 4] },
    });
    const parentLevel = result.n.findIndex((v) => v >= 3);
    expect(parentLevel).toBeGreaterThanOrEqual(0);
    const positions = result.pos[parentLevel]!.slice(0, result.n[parentLevel]);
    for (let j = 0; j < positions.length - 1; j++) {
      expect(positions[j + 1]! - positions[j]!).toBeGreaterThanOrEqual(
        1 - 1e-10,
      );
    }
  });

  it('lays out surrogacy family', () => {
    const result = alignPedigree(surrogacyFamily, {
      hints: { order: [1, 2, 3, 4] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(2);
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    for (let i = 0; i < 4; i++) {
      expect(allIds).toContain(i);
    }
  });

  it('places donor on the same row as social parents', () => {
    const result = alignPedigree(surrogacyFamily, {
      hints: { order: [1, 2, 3, 4] },
    });
    // Find which row each person is on
    const rowOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0) rowOf.set(pid, lev);
      }
    }
    // Social parents (0, 1) and surrogate (2) should be on the same row
    expect(rowOf.get(2)).toBe(rowOf.get(0));
    expect(rowOf.get(2)).toBe(rowOf.get(1));
    // Child (3) should be on a different (lower) row
    expect(rowOf.get(3)).toBeGreaterThan(rowOf.get(0)!);
  });

  it('places donor on same row as social parents in multi-gen pedigree', () => {
    // 3-gen: gp1(0) + gp2(1) -> parent(2); parent(2) + partner(3) -> child(4); donor(5) for child(4)
    const ped: PedigreeInput = {
      id: ['gp1', 'gp2', 'parent', 'partner', 'child', 'donor'],
      parents: [
        [],
        [],
        [sp(0), sp(1)],
        [],
        [
          { parentIndex: 2, edgeType: 'biological' },
          { parentIndex: 3, edgeType: 'biological' },
          { parentIndex: 5, edgeType: 'donor' },
        ],
        [],
      ],
    };
    const result = alignPedigree(ped, {
      hints: { order: [1, 2, 3, 4, 5, 6] },
    });

    const rowOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0) rowOf.set(pid, lev);
      }
    }
    // Donor (5) should be on the same row as social parents (2, 3)
    expect(rowOf.get(5)).toBe(rowOf.get(2));
    // All three should be on the middle level (not the grandparent level)
    expect(rowOf.get(5)).toBeGreaterThan(rowOf.get(0)!);
  });

  it('places donor on same row in Sperm Donor story scenario', () => {
    // Mimics the exact structure of the Sperm Donor storybook example:
    // gfA(0), gmA(1) -> momA(2); momA(2) + momB(3) -> ego(5), sibling(6); donor(4) for ego+sibling
    // ego(5) + egoPartner(7) -> grandchild(8)
    const ped: PedigreeInput = {
      id: [
        'gfA',
        'gmA',
        'momA',
        'momB',
        'donor',
        'ego',
        'sibling',
        'egoPartner',
        'grandchild',
      ],
      parents: [
        [], // gfA
        [], // gmA
        [sp(0), sp(1)], // momA
        [], // momB
        [], // donor
        [
          { parentIndex: 2, edgeType: 'biological' },
          { parentIndex: 3, edgeType: 'biological' },
          { parentIndex: 4, edgeType: 'donor' },
        ], // ego
        [
          { parentIndex: 2, edgeType: 'biological' },
          { parentIndex: 3, edgeType: 'biological' },
          { parentIndex: 4, edgeType: 'donor' },
        ], // sibling
        [], // egoPartner
        [sp(5), sp(7)], // grandchild
      ],
    };
    const result = alignPedigree(ped, {
      hints: { order: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    });

    const rowOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0) rowOf.set(pid, lev);
      }
    }

    // Donor (4) should be on same row as momA (2) and momB (3)
    expect(rowOf.get(4)).toBe(rowOf.get(2));
    // grandparents should be on a higher (earlier) row
    expect(rowOf.get(0)).toBeLessThan(rowOf.get(2)!);
    // grandchild should be on a lower row than ego
    expect(rowOf.get(8)).toBeGreaterThan(rowOf.get(5)!);
  });

  it('places both donor AND surrogate in layout (Donor + Surrogate story)', () => {
    // Exact structure of the Donor + Surrogate storybook example:
    // mgf(0), mgm(1) -> parentA(2), aunt(8)
    // parentA(2) + parentB(3) -> ego(6), sibling(7)
    // donor(4) for ego+sibling, surrogate(5) for ego+sibling
    // aunt(8) + auntPartner(9) -> cousin(10)
    // ego(6) + egoPartner(11) -> grandchild(12)
    const ped: PedigreeInput = {
      id: [
        'mgf',
        'mgm',
        'parentA',
        'parentB',
        'donor',
        'surrogate',
        'ego',
        'sibling',
        'aunt',
        'auntPartner',
        'cousin',
        'egoPartner',
        'grandchild',
      ],
      parents: [
        [], // mgf (0)
        [], // mgm (1)
        [sp(0), sp(1)], // parentA (2)
        [], // parentB (3)
        [], // donor (4)
        [], // surrogate (5)
        [
          { parentIndex: 2, edgeType: 'biological' },
          { parentIndex: 3, edgeType: 'biological' },
          { parentIndex: 4, edgeType: 'donor' },
          { parentIndex: 5, edgeType: 'surrogate' },
        ], // ego (6)
        [
          { parentIndex: 2, edgeType: 'biological' },
          { parentIndex: 3, edgeType: 'biological' },
          { parentIndex: 4, edgeType: 'donor' },
          { parentIndex: 5, edgeType: 'surrogate' },
        ], // sibling (7)
        [sp(0), sp(1)], // aunt (8)
        [], // auntPartner (9)
        [
          { parentIndex: 8, edgeType: 'biological' },
          { parentIndex: 9, edgeType: 'biological' },
        ], // cousin (10)
        [], // egoPartner (11)
        [
          { parentIndex: 6, edgeType: 'biological' },
          { parentIndex: 11, edgeType: 'biological' },
        ], // grandchild (12)
      ],
      relation: [
        { id1: 0, id2: 1, code: 4 },
        { id1: 2, id2: 3, code: 4 },
        { id1: 8, id2: 9, code: 4 },
        { id1: 6, id2: 11, code: 4 },
      ],
      partners: [
        { partnerIndex1: 0, partnerIndex2: 1, isActive: true },
        { partnerIndex1: 2, partnerIndex2: 3, isActive: true },
        { partnerIndex1: 8, partnerIndex2: 9, isActive: true },
        { partnerIndex1: 6, partnerIndex2: 11, isActive: true },
      ],
    };
    const result = alignPedigree(ped, {
      hints: { order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
    });

    const rowOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0) rowOf.set(pid, lev);
      }
    }

    // Both donor (4) and surrogate (5) should be placed in the layout
    expect(rowOf.has(4)).toBe(true);
    expect(rowOf.has(5)).toBe(true);
    // Both should be on the same row as the social parents
    expect(rowOf.get(4)).toBe(rowOf.get(2));
    expect(rowOf.get(5)).toBe(rowOf.get(2));

    // Donor and surrogate should have distinct column positions
    const colOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0 && !colOf.has(pid)) colOf.set(pid, result.pos[lev]![col]!);
      }
    }

    expect(colOf.get(4)).not.toBe(colOf.get(5));
    // Neither should overlap with the social parents
    expect(colOf.get(4)).not.toBe(colOf.get(2));
    expect(colOf.get(4)).not.toBe(colOf.get(3));
    expect(colOf.get(5)).not.toBe(colOf.get(2));
    expect(colOf.get(5)).not.toBe(colOf.get(3));
  });

  it('places bio-parent on same row as social parents', () => {
    const result = alignPedigree(blendedFamily, {
      hints: { order: [1, 2, 3, 4] },
    });
    const rowOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0) rowOf.set(pid, lev);
      }
    }
    // Bio-parent (2) should be on same row as social parents (0, 1)
    expect(rowOf.get(2)).toBe(rowOf.get(0));
  });

  it('auxiliary parent insertion does not split group pairs', () => {
    // partnerA(0) is donor, partnerB(1) is biological, they are a couple
    // donor edge from partnerA, bio edge from partnerB → child(2)
    const ped: PedigreeInput = {
      id: ['partnerA', 'partnerB', 'child'],
      parents: [
        [],
        [],
        [
          { parentIndex: 0, edgeType: 'donor' },
          { parentIndex: 1, edgeType: 'biological' },
        ],
      ],
      relation: [{ id1: 0, id2: 1, code: 4 }],
      partners: [{ partnerIndex1: 0, partnerIndex2: 1, isActive: true }],
    };
    const result = alignPedigree(ped, { hints: { order: [1, 2, 3] } });

    // Find row/col positions for partnerA and partnerB
    const colOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0 && !colOf.has(pid)) colOf.set(pid, col);
      }
    }

    // The group matrix should connect partnerA(0) and partnerB(1).
    // Find the parent level and check that the group marker connects them.
    const parentLev = result.n.findIndex((v) => v > 0);
    const col0 = colOf.get(0)!;
    const col1 = colOf.get(1)!;
    const leftCol = Math.min(col0, col1);

    // group[parentLev][leftCol] should be > 0 indicating a group connection
    expect(result.group[parentLev]![leftCol]).toBeGreaterThan(0);
  });

  it('subset donors have equal spacing from the family', () => {
    // mom(0) + 2 donors (1,2) + 2 children (3,4)
    // donor1→child3 only, donor2→child4 only
    const ped: PedigreeInput = {
      id: ['mom', 'donor1', 'donor2', 'child1', 'child2'],
      parents: [
        [],
        [],
        [],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'donor' },
        ],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 2, edgeType: 'donor' },
        ],
      ],
    };
    const result = alignPedigree(ped, { hints: { order: [1, 2, 3, 4, 5] } });

    const posOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0 && !posOf.has(pid)) {
          posOf.set(pid, result.pos[lev]![col]!);
        }
      }
    }

    const momPos = posOf.get(0)!;
    const donor1Pos = posOf.get(1)!;
    const donor2Pos = posOf.get(2)!;

    const dist1 = Math.abs(donor1Pos - momPos);
    const dist2 = Math.abs(donor2Pos - momPos);

    // Both donors should be equidistant from mom (within tolerance)
    expect(dist1).toBeCloseTo(dist2, 0);

    // Children should be centered under mom, not under donors
    const child1Pos = posOf.get(3)!;
    const child2Pos = posOf.get(4)!;
    const childCenter = (child1Pos + child2Pos) / 2;
    expect(childCenter).toBeCloseTo(momPos, 0);

    // Each donor should NOT be directly above its child (should be diagonal)
    expect(donor1Pos).not.toBeCloseTo(child1Pos, 0);
    expect(donor2Pos).not.toBeCloseTo(child2Pos, 0);
  });

  it('places child directly under sole primary parent in reciprocal IVF', () => {
    // partnerA(0) + partnerB(1) couple; partnerA→pregnancy(3) is donor,
    // partnerB→pregnancy is biological; spermDonor(2)→pregnancy is donor
    const ped: PedigreeInput = {
      id: ['partnerA', 'partnerB', 'spermDonor', 'pregnancy'],
      parents: [
        [],
        [],
        [],
        [
          { parentIndex: 0, edgeType: 'donor' },
          { parentIndex: 1, edgeType: 'biological' },
          { parentIndex: 2, edgeType: 'donor' },
        ],
      ],
      relation: [{ id1: 0, id2: 1, code: 4 }],
      partners: [{ partnerIndex1: 0, partnerIndex2: 1, isActive: true }],
    };
    const result = alignPedigree(ped, {
      hints: { order: [1, 2, 3, 4] },
    });

    const posOf = new Map<number, number>();
    const rowOf = new Map<number, number>();
    for (let lev = 0; lev < result.n.length; lev++) {
      for (let col = 0; col < (result.n[lev] ?? 0); col++) {
        const pid = result.nid[lev]![col]!;
        if (pid >= 0 && !posOf.has(pid)) {
          posOf.set(pid, result.pos[lev]![col]!);
          rowOf.set(pid, lev);
        }
      }
    }

    // All 4 nodes should be placed
    expect(posOf.has(0)).toBe(true);
    expect(posOf.has(1)).toBe(true);
    expect(posOf.has(2)).toBe(true);
    expect(posOf.has(3)).toBe(true);

    // Pregnancy (3) should be directly under partnerB (1)
    expect(posOf.get(3)).toBe(posOf.get(1));
  });
});

// --- Regression tests: traditional families still produce correct layouts ---

const sp = (parentIndex: number): ParentConnection => ({
  parentIndex,
  edgeType: 'biological',
});

const defaultScaling: ScalingParams = {
  boxWidth: 1,
  boxHeight: 0.5,
  legHeight: 0.25,
  hScale: 1,
  vScale: 1,
};

describe('traditional family regression', () => {
  it('nuclear family: parents and children on separate levels', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    // 2 active levels
    const activeLevels = result.n.filter((v) => v > 0);
    expect(activeLevels.length).toBe(2);

    // Find which levels have people
    const parentLevIdx = result.n.findIndex((v) => v > 0);
    const childLevIdx = result.n.findIndex((v, i) => v > 0 && i > parentLevIdx);

    // Parent level: 2 people (indices 0 and 1)
    expect(result.n[parentLevIdx]).toBe(2);
    const parentLevel = result.nid[parentLevIdx]!.slice(
      0,
      result.n[parentLevIdx],
    );
    expect(parentLevel).toContain(0);
    expect(parentLevel).toContain(1);

    // Child level: 3 people (indices 2, 3, 4)
    expect(result.n[childLevIdx]).toBe(3);
    const childLevel = result.nid[childLevIdx]!.slice(0, result.n[childLevIdx]);
    expect(childLevel).toContain(2);
    expect(childLevel).toContain(3);
    expect(childLevel).toContain(4);
  });

  it('nuclear family: parent group marker between parents', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    // Group matrix should mark a connection on the parent level
    const hasGroupMark = result.group.some((row) => row.some((v) => v > 0));
    expect(hasGroupMark).toBe(true);
  });

  it('nuclear family: children linked to correct family', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    // Find the child level (second active level)
    const parentLevIdx = result.n.findIndex((v) => v > 0);
    const childLevIdx = result.n.findIndex((v, i) => v > 0 && i > parentLevIdx);
    // All children should share the same fam value > 0
    const childFams = result.fam[childLevIdx]!.slice(0, result.n[childLevIdx]);
    const uniqueFams = [...new Set(childFams)];
    expect(uniqueFams.length).toBe(1);
    expect(uniqueFams[0]).toBeGreaterThan(0);
  });

  it('a half-sibling through the left partner keeps a family of their own', () => {
    // parent1 ⚭ parent2 with a child; a half-sibling of parent1's alone.
    const ped: PedigreeInput = {
      id: ['parent1', 'parent2', 'full', 'half'],
      parents: [
        [],
        [],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'biological' },
        ],
        [{ parentIndex: 0, edgeType: 'biological' }],
      ],
    };
    const result = alignPedigree(ped, { hints: { order: [1, 2, 3, 4] } });
    const level = result.nid.findIndex((row) => row.includes(3));
    const famOf = (person: number) =>
      result.fam[level]![result.nid[level]!.indexOf(person)]!;
    expect(famOf(3)).not.toBe(famOf(2));
    expect(famOf(3)).toBeLessThan(0);

    // Each family has its own line of descent, the half-sibling's from
    // parent1 alone.
    const conn = computeConnectors(result, defaultScaling, ped.parents);
    expect(conn.parentChildLines).toHaveLength(2);
  });

  it('nuclear family: connectors include parent group line and parent-child links', () => {
    const result = alignPedigree(nuclearFamily, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    const conn = computeConnectors(
      result,
      defaultScaling,
      nuclearFamily.parents,
    );
    expect(conn.groupLines.length).toBeGreaterThanOrEqual(1);
    expect(conn.parentChildLines.length).toBeGreaterThanOrEqual(1);
    expect(conn.auxiliaryLines.length).toBe(0);
    expect(conn.duplicateArcs.length).toBe(0);
  });

  it('three-generation: grandparents, parents, grandchild on separate levels', () => {
    const result = alignPedigree(threeGeneration, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    expect(result.n.filter((v) => v > 0).length).toBe(3);

    // All people present in layout
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    for (let i = 0; i < 5; i++) {
      expect(allIds).toContain(i);
    }

    // Grandchild (4) on the deepest active level
    const activeLevels = result.n
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v > 0);
    const deepest = activeLevels[activeLevels.length - 1]!.i;
    const deepestIds = result.nid[deepest]!.slice(0, result.n[deepest]);
    expect(deepestIds).toContain(4);
  });

  it('multiple marriages: shared parent appears in both family groups', () => {
    const result = alignPedigree(multipleMarriages, {
      hints: { order: [1, 2, 3, 4, 5] },
    });
    // Parent 0 should appear in the layout (possibly duplicated)
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    expect(allIds.filter((id) => id === 0).length).toBeGreaterThanOrEqual(1);

    // Both children should be present
    expect(allIds).toContain(3);
    expect(allIds).toContain(4);

    // At least 2 group lines (one per partnership)
    const conn = computeConnectors(
      result,
      defaultScaling,
      multipleMarriages.parents,
    );
    expect(conn.groupLines.length).toBeGreaterThanOrEqual(2);
  });

  it('wide family: all 5 children get distinct positions', () => {
    const result = alignPedigree(wideFamily, {
      hints: { order: [1, 2, 3, 4, 5, 6, 7] },
    });
    // Find the child level (has 5 people)
    const childLevIdx = result.n.findIndex((v) => v === 5);
    expect(childLevIdx).toBeGreaterThanOrEqual(0);
    const childPositions = result.pos[childLevIdx]!.slice(
      0,
      result.n[childLevIdx],
    );
    // All positions should be distinct and increasing
    for (let j = 0; j < childPositions.length - 1; j++) {
      expect(childPositions[j + 1]!).toBeGreaterThan(childPositions[j]!);
    }
    expect(childPositions.length).toBe(5);
  });

  it('complex traditional pedigree: 2 couples, shared grandchild', () => {
    // Couple A (0,1) -> child A (4)
    // Couple B (2,3) -> child B (5)
    // child A + child B -> grandchild (6)
    const ped: PedigreeInput = {
      id: ['gpA1', 'gpA2', 'gpB1', 'gpB2', 'parentA', 'parentB', 'grandchild'],
      parents: [[], [], [], [], [sp(0), sp(1)], [sp(2), sp(3)], [sp(4), sp(5)]],
    };
    const result = alignPedigree(ped, {
      hints: { order: [1, 2, 3, 4, 5, 6, 7] },
    });

    // 3 active levels
    expect(result.n.filter((v) => v > 0).length).toBe(3);

    // All people present
    const allIds = result.nid.flatMap((row, i) =>
      row.slice(0, result.n[i]).filter((v) => v >= 0),
    );
    for (let i = 0; i < 7; i++) {
      expect(allIds).toContain(i);
    }

    // Grandchild on the deepest active level
    const activeLevels = result.n
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v > 0);
    const deepest = activeLevels[activeLevels.length - 1]!.i;
    const deepestIds = result.nid[deepest]!.slice(0, result.n[deepest]);
    expect(deepestIds).toContain(6);

    // Connectors: at least 3 group lines, at least 3 parent-child links.
    // parentB is a .5 group member (marry-in) and gets an individual
    // parent-child connector to avoid overlapping sibling bars.
    const conn = computeConnectors(result, defaultScaling, ped.parents);
    expect(conn.groupLines.length).toBeGreaterThanOrEqual(3);
    expect(conn.parentChildLines.length).toBeGreaterThanOrEqual(3);
    expect(conn.auxiliaryLines.length).toBe(0);
  });

  it('multiple marriages: children from different couples get separate parent-child connectors', () => {
    const result = alignPedigree(multipleMarriages, {
      hints: { order: [1, 2, 3, 4, 5] },
    });

    const conn = computeConnectors(
      result,
      defaultScaling,
      multipleMarriages.parents,
    );

    // Should produce 2 separate parent-child connectors (one per couple)
    expect(conn.parentChildLines.length).toBe(2);

    // Parent links should target different x positions
    const x1 = conn.parentChildLines[0]!.parentLink[0]!.x1;
    const x2 = conn.parentChildLines[1]!.parentLink[0]!.x1;
    expect(x1).not.toBeCloseTo(x2, 1);
  });
});

it('adoption by relative: no duplicate group lines', () => {
  const bioParent = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'biological',
  });

  const ped: PedigreeInput = {
    id: ['grandpa', 'grandma', 'father', 'aunt', 'uncle', 'child'],
    parents: [
      [],
      [],
      [bioParent(0), bioParent(1)],
      [bioParent(0), bioParent(1)],
      [],
      [
        { parentIndex: 2, edgeType: 'biological' },
        { parentIndex: 3, edgeType: 'social' },
        { parentIndex: 4, edgeType: 'social' },
      ],
    ],
    relation: [{ id1: 3, id2: 4, code: 4 }],
    partners: [
      { partnerIndex1: 0, partnerIndex2: 1, isActive: true },
      { partnerIndex1: 3, partnerIndex2: 4, isActive: true },
    ],
  };
  const result = alignPedigree(ped, {
    hints: { order: [1, 2, 3, 4, 5, 6] },
  });

  const conn = computeConnectors(result, defaultScaling, ped.parents);

  // There should be exactly 2 group lines (grandpa+grandma, aunt+uncle)
  expect(conn.groupLines.length).toBe(2);
});

// --- Cross-family alignment tests ---

function positionOf(
  result: ReturnType<typeof alignPedigree>,
  nodeIndex: number,
): { layer: number; pos: number } | undefined {
  for (let lev = 0; lev < result.n.length; lev++) {
    for (let col = 0; col < (result.n[lev] ?? 0); col++) {
      if (result.nid[lev]![col] === nodeIndex) {
        return { layer: lev, pos: result.pos[lev]![col]! };
      }
    }
  }
  return undefined;
}

describe('cross-family alignment', () => {
  it('normalizes positions globally so parent-child alignment is preserved', () => {
    const result = alignPedigree(crossFamily);

    // gpA1(0)+gpA2(1) should be roughly centered over childA(4)
    // gpB1(2)+gpB2(3) should be roughly centered over childB(5)
    const gpA1 = positionOf(result, 0)!;
    const gpA2 = positionOf(result, 1)!;
    const gpB1 = positionOf(result, 2)!;
    const gpB2 = positionOf(result, 3)!;
    const childA = positionOf(result, 4)!;
    const childB = positionOf(result, 5)!;

    const gpACenterX = (gpA1.pos + gpA2.pos) / 2;
    const gpBCenterX = (gpB1.pos + gpB2.pos) / 2;

    // Parent couple center should be within 1 unit of the child they
    // connect to. Without global normalization, the per-layer shift
    // breaks this alignment and the distance can exceed 2+.
    expect(Math.abs(gpACenterX - childA.pos)).toBeLessThan(1.5);
    expect(Math.abs(gpBCenterX - childB.pos)).toBeLessThan(1.5);
  });

  it('partners in cross-family marriages are adjacent', () => {
    const result = alignPedigree(crossFamily);

    const childA = positionOf(result, 4)!;
    const childB = positionOf(result, 5)!;

    // childA and childB are partners — they should be on the same layer
    // and adjacent (within 2 units, allowing for sibling block spacing)
    expect(childA.layer).toBe(childB.layer);
    expect(Math.abs(childA.pos - childB.pos)).toBeLessThanOrEqual(2 + 1e-10);
  });
});

describe('a participant with two partners', () => {
  // The Multiple Partners story: You (0) had Ben (4) with a former partner,
  // Chris (1), and Cleo (5) with a current partner, Alex (2), who is Cleo's
  // social parent. Sky (6) is the biological child of Alex and Alex's former
  // partner (3), and a social child of You.
  const social = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'social',
  });
  const ped: PedigreeInput = {
    id: ['you', 'chris', 'alex', 'alexsFormer', 'ben', 'cleo', 'sky'],
    parents: [
      [],
      [],
      [],
      [],
      [sp(0), sp(1)],
      [sp(0), social(2)],
      [sp(2), sp(3), social(0)],
    ],
    partners: [
      { partnerIndex1: 0, partnerIndex2: 1, isActive: false },
      { partnerIndex1: 0, partnerIndex2: 2, isActive: true },
      { partnerIndex1: 2, partnerIndex2: 3, isActive: false },
    ],
  };

  const result = alignPedigree(ped);
  const parentLevel = result.nid.findIndex((row) => row.includes(0));
  const childLevel = result.nid.findIndex((row) => row.includes(4));
  const columnOf = (person: number) => result.nid[parentLevel]!.indexOf(person);
  const famOf = (person: number) =>
    result.fam[childLevel]![result.nid[childLevel]!.indexOf(person)]!;
  // A couple's family is its left partner's 1-based column, and the couple
  // must be adjacent for the partnership line and the descent to be drawn.
  const coupleFam = (a: number, b: number) => {
    expect(Math.abs(columnOf(a) - columnOf(b))).toBe(1);
    const left = Math.min(columnOf(a), columnOf(b));
    expect(result.group[parentLevel]![left]).toBeGreaterThan(0);
    return left + 1;
  };

  it('places each partner of the participant on either side of them', () => {
    const you = columnOf(0);
    expect([columnOf(1), columnOf(2)].toSorted((a, b) => a - b)).toStrictEqual([
      you - 1,
      you + 1,
    ]);
    // Alex's former partner sits on Alex's other side.
    expect(Math.abs(columnOf(3) - columnOf(2))).toBe(1);
    expect(columnOf(3)).not.toBe(you);
  });

  it('assigns each child to the couple they descend from', () => {
    expect(famOf(4)).toBe(coupleFam(0, 1));
    expect(famOf(5)).toBe(coupleFam(0, 2));
    // Sky descends from her biological parents, not her social parent's couple.
    expect(famOf(6)).toBe(coupleFam(2, 3));
  });

  it('draws one line of descent per couple and a social line from You to Sky', () => {
    const conn = computeConnectors(
      result,
      defaultScaling,
      ped.parents,
      new Set(['0,2']),
      undefined,
      undefined,
      undefined,
      undefined,
      new Set(['0,1', '0,2', '2,3']),
    );
    expect(conn.parentChildLines).toHaveLength(3);
    const socialLines = conn.auxiliaryLines.filter(
      (line) => line.edgeType === 'social',
    );
    expect(socialLines).toHaveLength(1);
  });
});

describe('partnership chains', () => {
  const step = (parentIndex: number): ParentConnection => ({
    parentIndex,
    edgeType: 'social',
  });
  const couple = (a: number, b: number) => ({
    partnerIndex1: a,
    partnerIndex2: b,
    isActive: true,
  });

  // Every recorded partnership is drawn between adjacent partners: the
  // partnership line and the couple's line of descent need it.
  const expectEveryCoupleAdjacent = (ped: PedigreeInput) => {
    const result = alignPedigree(ped);
    for (const { partnerIndex1: a, partnerIndex2: b } of ped.partners ?? []) {
      const levelA = result.nid.findIndex((row) => row.includes(a));
      const levelB = result.nid.findIndex((row) => row.includes(b));
      expect(levelA, `${ped.id[a]} and ${ped.id[b]}`).toBe(levelB);
      const colA = result.nid[levelA]!.indexOf(a);
      const colB = result.nid[levelB]!.indexOf(b);
      expect(Math.abs(colA - colB), `${ped.id[a]} beside ${ped.id[b]}`).toBe(1);
    }
  };

  it('keeps a chain through a person with a sibling together', () => {
    // mum + dad → you, sib. chris – you – alex – alexsFormer.
    expectEveryCoupleAdjacent({
      id: ['mum', 'dad', 'you', 'sib', 'chris', 'alex', 'alexsFormer'],
      parents: [[], [], [sp(0), sp(1)], [sp(0), sp(1)], [], [], []],
      partners: [couple(0, 1), couple(2, 4), couple(2, 5), couple(5, 6)],
    });
  });

  it('keeps a chain hanging from one end of a sibling together', () => {
    // mum + dad → you, sib. you – alex – alexsFormer.
    expectEveryCoupleAdjacent({
      id: ['mum', 'dad', 'you', 'sib', 'alex', 'alexsFormer'],
      parents: [[], [], [sp(0), sp(1)], [sp(0), sp(1)], [], []],
      partners: [couple(0, 1), couple(2, 4), couple(4, 5)],
    });
  });

  it('keeps a chain together where it crosses two sibships', () => {
    // mum + dad → you, sib; gm + gd → alex, alexsSib.
    // you – alex – alexsFormer – theirPartner.
    expectEveryCoupleAdjacent({
      id: [
        'mum',
        'dad',
        'gm',
        'gd',
        'you',
        'sib',
        'alex',
        'alexsSib',
        'alexsFormer',
        'theirPartner',
      ],
      parents: [
        [],
        [],
        [],
        [],
        [sp(0), sp(1)],
        [sp(0), sp(1)],
        [sp(2), sp(3)],
        [sp(2), sp(3)],
        [],
        [],
      ],
      partners: [
        couple(0, 1),
        couple(2, 3),
        couple(4, 6),
        couple(6, 8),
        couple(8, 9),
      ],
    });
  });

  it('keeps a chain together where it returns to the same sibship', () => {
    // mum + dad → sibA, sibB, sibC. sibA – p1 – p2 – sibB – p3 – sibC.
    expectEveryCoupleAdjacent({
      id: ['mum', 'dad', 'sibA', 'sibB', 'sibC', 'p1', 'p2', 'p3'],
      parents: [
        [],
        [],
        [sp(0), sp(1)],
        [sp(0), sp(1)],
        [sp(0), sp(1)],
        [],
        [],
        [],
      ],
      partners: [
        couple(0, 1),
        couple(2, 5),
        couple(5, 6),
        couple(6, 3),
        couple(3, 7),
        couple(7, 4),
      ],
    });
  });

  it('puts a chain recorded from its far end on one row', () => {
    // mum + dad → c2, sib. Partnerships recorded c0 – c1, c1 – c2, c2 – c3.
    expectEveryCoupleAdjacent({
      id: ['mum', 'dad', 'c0', 'c1', 'c2', 'c3', 'sib'],
      parents: [[], [], [], [], [sp(0), sp(1)], [], [sp(0), sp(1)]],
      partners: [couple(0, 1), couple(2, 3), couple(3, 4), couple(4, 5)],
    });
  });

  it('moves a raised partner’s children down with them', () => {
    // a – b – c, where c's parents are shown, so the chain sits on c's row.
    // a already has a child of their own, kid.
    const ped: PedigreeInput = {
      id: ['mum', 'dad', 'c', 'a', 'b', 'kid'],
      parents: [[], [], [sp(0), sp(1)], [], [], [sp(3)]],
      partners: [couple(0, 1), couple(3, 4), couple(4, 2)],
    };
    expectEveryCoupleAdjacent(ped);
    const result = alignPedigree(ped);
    const levelOf = (person: number) =>
      result.nid.findIndex((row) => row.includes(person));
    expect(levelOf(5)).toBe(levelOf(3) + 1);
    const kidLevel = levelOf(5);
    expect(result.fam[kidLevel]![result.nid[kidLevel]!.indexOf(5)]).not.toBe(0);
  });

  it('keeps a chain together across four sibships', () => {
    // a, b, c and d each have parents and a sibling shown; a – b – c – d.
    const id: string[] = [];
    const parents: ParentConnection[][] = [];
    const partners: NonNullable<PedigreeInput['partners']> = [];
    const people = ['a', 'b', 'c', 'd'].map((name) => {
      const mum = id.push(`${name}Mum`) - 1;
      const dad = id.push(`${name}Dad`) - 1;
      parents.push([], []);
      partners.push(couple(mum, dad));
      const person = id.push(name) - 1;
      id.push(`${name}Sib`);
      parents.push([sp(mum), sp(dad)], [sp(mum), sp(dad)]);
      return person;
    });
    for (let k = 0; k + 1 < people.length; k++) {
      partners.push(couple(people[k]!, people[k + 1]!));
    }
    expectEveryCoupleAdjacent({ id, parents, partners });
  });

  it('keeps a child under its parent when its donor is moved down', () => {
    // parent's child kid was conceived with donor d; d's partner x has parents
    // shown, so d is moved down to x's row.
    const ped: PedigreeInput = {
      id: ['xMum', 'xDad', 'x', 'd', 'parent', 'kid'],
      parents: [
        [],
        [],
        [sp(0), sp(1)],
        [],
        [],
        [sp(4), { parentIndex: 3, edgeType: 'donor' }],
      ],
      partners: [couple(0, 1), couple(3, 2)],
    };
    const result = alignPedigree(ped);
    const levelOf = (person: number) =>
      result.nid.findIndex((row) => row.includes(person));
    expect(levelOf(5)).toBe(levelOf(4) + 1);
    const kidLevel = levelOf(5);
    expect(result.fam[kidLevel]![result.nid[kidLevel]!.indexOf(5)]).not.toBe(0);
  });

  it('seats a donor to an interior couple outside the chain', () => {
    // a – b – c – d; b + c → kid, with an egg donor.
    expectEveryCoupleAdjacent({
      id: ['a', 'b', 'c', 'd', 'donor', 'kid'],
      parents: [
        [],
        [],
        [],
        [],
        [],
        [sp(1), sp(2), { parentIndex: 4, edgeType: 'donor' }],
      ],
      partners: [couple(0, 1), couple(1, 2), couple(2, 3)],
    });
  });

  it('moves a chain member to a join without splitting the rest of its chain', () => {
    // m1 + f1 → c, sibC; m2 + f2 → x, sibX. a – b – c – d – e, and c – x.
    // c has three partners, so exactly one partnership is drawn apart.
    const ped: PedigreeInput = {
      id: [
        'm1',
        'f1',
        'm2',
        'f2',
        'c',
        'sibC',
        'x',
        'sibX',
        'a',
        'b',
        'd',
        'e',
      ],
      parents: [
        [],
        [],
        [],
        [],
        [sp(0), sp(1)],
        [sp(0), sp(1)],
        [sp(2), sp(3)],
        [sp(2), sp(3)],
        [],
        [],
        [],
        [],
      ],
      partners: [
        couple(0, 1),
        couple(2, 3),
        couple(8, 9),
        couple(9, 4),
        couple(4, 10),
        couple(10, 11),
        couple(4, 6),
      ],
    };
    const result = alignPedigree(ped);
    const apart = (ped.partners ?? []).filter(
      ({ partnerIndex1: a, partnerIndex2: b }) => {
        const level = result.nid.findIndex((row) => row.includes(a));
        return (
          !result.nid[level]!.includes(b) ||
          Math.abs(
            result.nid[level]!.indexOf(a) - result.nid[level]!.indexOf(b),
          ) !== 1
        );
      },
    );
    expect(
      apart.map(
        (pc) => `${ped.id[pc.partnerIndex1]}–${ped.id[pc.partnerIndex2]}`,
      ),
    ).toHaveLength(1);
  });

  it('seats a donor beside a couple without splitting the chain', () => {
    // you – alex – alexsFormer; you + alex → child, with an egg donor.
    expectEveryCoupleAdjacent({
      id: ['you', 'alex', 'alexsFormer', 'donor', 'child'],
      parents: [
        [],
        [],
        [],
        [],
        [sp(0), sp(1), { parentIndex: 3, edgeType: 'donor' }],
      ],
      partners: [couple(0, 1), couple(1, 2)],
    });
    expectEveryCoupleAdjacent({
      id: ['alexsFormer', 'alex', 'you', 'donor', 'child'],
      parents: [
        [],
        [],
        [],
        [],
        [sp(1), sp(2), { parentIndex: 3, edgeType: 'donor' }],
      ],
      partners: [couple(0, 1), couple(1, 2)],
    });
  });

  it('gives a child two equally strong couples the first one recorded', () => {
    // parent – stepA and parent – stepB; the child is parent's biological
    // child and a social child of both step-parents.
    const childOf = (partners: PedigreeInput['partners']) => {
      const ped: PedigreeInput = {
        id: ['parent', 'stepA', 'stepB', 'child'],
        parents: [[], [], [], [sp(0), step(1), step(2)]],
        partners,
      };
      const result = alignPedigree(ped);
      const level = result.nid.findIndex((row) => row.includes(3));
      const fam = result.fam[level]![result.nid[level]!.indexOf(3)]!;
      const above = result.nid[level - 1]!;
      return [above[fam - 1], above[fam]].toSorted((a, b) => a! - b!);
    };
    expect(childOf([couple(0, 1), couple(0, 2)])).toStrictEqual([0, 1]);
    expect(childOf([couple(0, 2), couple(0, 1)])).toStrictEqual([0, 2]);
  });
});

describe('a person with three partners', () => {
  // One of three partnerships cannot sit side by side. parent's partners are
  // a, b and c; kidA and kidB are children of the first two couples. kidC is
  // the biological child of parent and c and a social child of b; kidC2 is
  // c's and parent's only.
  const ped: PedigreeInput = {
    id: ['parent', 'a', 'b', 'c', 'kidA', 'kidB', 'kidC', 'kidC2'],
    parents: [
      [],
      [],
      [],
      [],
      [sp(0), sp(1)],
      [sp(0), sp(2)],
      [sp(0), sp(3), { parentIndex: 2, edgeType: 'social' }],
      [sp(0), sp(3)],
    ],
    partners: [
      { partnerIndex1: 0, partnerIndex2: 1, isActive: false },
      { partnerIndex1: 0, partnerIndex2: 2, isActive: false },
      { partnerIndex1: 0, partnerIndex2: 3, isActive: true },
    ],
  };

  it('draws each line of descent only from the child’s own parents', () => {
    const result = alignPedigree(ped);
    const level = result.nid.findIndex((row) => row.includes(4));
    const above = result.nid[level - 1]!;
    for (let col = 0; col < result.n[level]!; col++) {
      const child = result.nid[level]![col]!;
      const fam = result.fam[level]![col]!;
      if (fam <= 0) continue;
      // How the connectors read a family: the couple's left partner, and the
      // person to its right when a partnership joins them.
      const left = fam - 1;
      const drawn = [above[left]!];
      if ((result.group[level - 1]![left] ?? 0) > 0) {
        drawn.push(above[left + 1]!);
      }
      const parents = ped.parents[child]!.map((p) => p.parentIndex);
      for (const parent of drawn) {
        expect(parents, `${ped.id[child]} from ${ped.id[parent]}`).toContain(
          parent,
        );
      }
      expect(drawn, `${ped.id[child]} from a couple`).toHaveLength(2);
    }
  });

  it('joins each parent of a couple that cannot sit together to the child', () => {
    const result = alignPedigree(ped);
    const level = result.nid.findIndex((row) => row.includes(4));
    const conn = computeConnectors(
      result,
      defaultScaling,
      ped.parents,
      new Set(['0,3']),
      undefined,
      undefined,
      undefined,
      ped.id,
      new Set(['0,1', '0,2', '0,3']),
    );
    const direct = new Set(
      conn.auxiliaryLines.map((line) => line.endpointIds?.join('→')),
    );
    let withoutFamily = 0;
    for (let col = 0; col < result.n[level]!; col++) {
      if (result.fam[level]![col] !== 0) continue;
      withoutFamily++;
      const child = result.nid[level]![col]!;
      for (const { parentIndex } of ped.parents[child]!) {
        expect(direct).toContain(`${ped.id[parentIndex]}→${ped.id[child]}`);
      }
    }
    // parent – c is the partnership left apart, so both of its children are
    // drawn this way.
    expect(withoutFamily).toBe(2);
  });

  // Every primary parent of a child without a family has its own line to the
  // child, whether or not the parents were recorded as partners.
  const expectDirectLinesForChildrenWithoutFamily = (
    input: PedigreeInput,
    expectedWithoutFamily: number,
  ) => {
    const result = alignPedigree(input);
    const conn = computeConnectors(
      result,
      defaultScaling,
      input.parents,
      new Set(),
      undefined,
      undefined,
      undefined,
      input.id,
      new Set(),
    );
    const direct = new Set(
      conn.auxiliaryLines.map((line) => line.endpointIds?.join('→')),
    );
    let withoutFamily = 0;
    for (let level = 1; level < result.n.length; level++) {
      for (let col = 0; col < result.n[level]!; col++) {
        if (result.fam[level]![col] !== 0) continue;
        const child = result.nid[level]![col]!;
        const primary = input.parents[child]!.filter(
          (p) => p.edgeType !== 'donor' && p.edgeType !== 'surrogate',
        );
        if (primary.length === 0) continue;
        withoutFamily++;
        for (const { parentIndex } of primary) {
          expect(direct).toContain(
            `${input.id[parentIndex]}→${input.id[child]}`,
          );
        }
      }
    }
    expect(withoutFamily).toBe(expectedWithoutFamily);
  };

  it('joins each parent to a child of a separated couple inferred from children', () => {
    // No partnerships recorded: parent's three couples are inferred from the
    // children they share, and one of them cannot sit together.
    expectDirectLinesForChildrenWithoutFamily(
      {
        id: ['parent', 'a', 'b', 'c', 'kidA', 'kidB', 'kidC'],
        parents: [
          [],
          [],
          [],
          [],
          [sp(0), sp(1)],
          [sp(0), sp(2)],
          [sp(0), sp(3)],
        ],
      },
      1,
    );
  });

  it('joins each parent to a child whose parents are not a couple', () => {
    // A biological parent and an unpartnered step-parent: no couple to
    // descend from.
    expectDirectLinesForChildrenWithoutFamily(
      {
        id: ['parent', 'step', 'kid'],
        parents: [[], [], [sp(0), { parentIndex: 1, edgeType: 'social' }]],
      },
      1,
    );
  });

  it('draws each direct line with its own relationship', () => {
    // Two children without a family share parents in different roles: p is
    // kid1's biological parent and kid2's step-parent; d is kid1's donor and
    // kid2's surrogate.
    const social = (parentIndex: number): ParentConnection => ({
      parentIndex,
      edgeType: 'social',
    });
    const input: PedigreeInput = {
      id: ['p', 'q', 'r', 'd', 'kid1', 'kid2'],
      parents: [
        [],
        [],
        [],
        [],
        [sp(0), social(1), { parentIndex: 3, edgeType: 'donor' }],
        [sp(2), social(0), { parentIndex: 3, edgeType: 'surrogate' }],
      ],
    };
    const result = alignPedigree(input);
    const level = result.nid.findIndex((row) => row.includes(4));
    for (const kid of [4, 5]) {
      expect(result.fam[level]![result.nid[level]!.indexOf(kid)]).toBe(0);
    }
    const conn = computeConnectors(
      result,
      defaultScaling,
      input.parents,
      new Set(),
      undefined,
      undefined,
      undefined,
      input.id,
      new Set(),
    );
    const lines = new Map(
      conn.auxiliaryLines.map((line) => [
        line.endpointIds?.join('→'),
        line.edgeType,
      ]),
    );
    expect(lines.get('p→kid1')).toBe('biological');
    expect(lines.get('p→kid2')).toBe('social');
    expect(lines.get('d→kid1')).toBe('donor');
    expect(lines.get('d→kid2')).toBe('surrogate');
  });

  it('joins a child without a family to its only parent', () => {
    // Whatever leaves a single parent's child without a family, the parent is
    // still joined to it.
    const input: PedigreeInput = {
      id: ['parent', 'kid'],
      parents: [[], [sp(0)]],
    };
    const result = alignPedigree(input);
    const level = result.nid.findIndex((row) => row.includes(1));
    result.fam[level]![result.nid[level]!.indexOf(1)] = 0;
    const conn = computeConnectors(
      result,
      defaultScaling,
      input.parents,
      new Set(),
      undefined,
      undefined,
      undefined,
      input.id,
      new Set(),
    );
    expect(
      conn.auxiliaryLines.map((line) => line.endpointIds?.join('→')),
    ).toContain('parent→kid');
  });

  it('joins a donor to a child whose couple cannot sit together', () => {
    // kidC2 of the couple left apart, conceived with an egg donor.
    const withDonor: PedigreeInput = {
      ...ped,
      id: [...ped.id, 'donor'],
      parents: [
        ...ped.parents.slice(0, 7),
        [sp(0), sp(3), { parentIndex: 8, edgeType: 'donor' }],
        [],
      ],
    };
    const result = alignPedigree(withDonor);
    const level = result.nid.findIndex((row) => row.includes(7));
    expect(result.fam[level]![result.nid[level]!.indexOf(7)]).toBe(0);
    const conn = computeConnectors(
      result,
      defaultScaling,
      withDonor.parents,
      new Set(['0,3']),
      undefined,
      undefined,
      undefined,
      withDonor.id,
      new Set(['0,1', '0,2', '0,3']),
    );
    const donorLines = conn.auxiliaryLines.filter(
      (line) => line.edgeType === 'donor',
    );
    expect(donorLines.map((line) => line.endpointIds)).toStrictEqual([
      ['donor', 'kidC2'],
    ]);
  });

  // kidC and kidC2 are twins of the couple left apart (parent and c).
  const twinsOfSeparatedCouple = (code: 1 | 2 | 3): PedigreeInput => ({
    ...ped,
    parents: [...ped.parents.slice(0, 6), [sp(0), sp(3)], [sp(0), sp(3)]],
    relation: [{ id1: 6, id2: 7, code }],
  });

  it.each([1, 2, 3] as const)(
    'marks twins (code %i) whose couple cannot sit together',
    (code) => {
      const input = twinsOfSeparatedCouple(code);
      const result = alignPedigree(input);
      const level = result.nid.findIndex((row) => row.includes(6));
      for (const kid of [6, 7]) {
        expect(result.fam[level]![result.nid[level]!.indexOf(kid)]).toBe(0);
      }
      const conn = computeConnectors(
        result,
        defaultScaling,
        input.parents,
        new Set(['0,3']),
        undefined,
        undefined,
        undefined,
        input.id,
        new Set(['0,1', '0,2', '0,3']),
      );
      expect(
        conn.twinIndicators.map((t) => [t.code, [...(t.twinIds ?? [])].sort()]),
      ).toStrictEqual([[code, ['kidC', 'kidC2']]]);
      // The twins hang from one sibling bar, which each parent joins.
      const bars = conn.parentChildLines.filter((line) =>
        line.uplineChildIds?.includes('kidC'),
      );
      expect(bars).toHaveLength(1);
      expect(bars[0]!.uplineChildIds).toStrictEqual(
        expect.arrayContaining(['kidC', 'kidC2']),
      );
      const toBar = conn.auxiliaryLines
        .filter((line) => line.endpointIds?.[1] === undefined)
        .map((line) => line.endpointIds?.[0]);
      expect(toBar).toStrictEqual(expect.arrayContaining(['parent', 'c']));
    },
  );

  it('keeps an adoptive relationship on a direct line', () => {
    // No partnerships recorded; kidC's adoptive parents are inferred as a
    // couple, and it is the one that cannot sit together.
    const adoptive = (parentIndex: number): ParentConnection => ({
      parentIndex,
      edgeType: 'adoptive',
    });
    const input: PedigreeInput = {
      id: ['parent', 'a', 'b', 'c', 'kidA', 'kidB', 'kidC'],
      parents: [
        [],
        [],
        [],
        [],
        [sp(0), sp(1)],
        [sp(0), sp(2)],
        [adoptive(0), adoptive(3)],
      ],
    };
    const result = alignPedigree(input);
    const level = result.nid.findIndex((row) => row.includes(6));
    expect(result.fam[level]![result.nid[level]!.indexOf(6)]).toBe(0);
    const conn = computeConnectors(
      result,
      defaultScaling,
      input.parents,
      new Set(),
      undefined,
      undefined,
      undefined,
      input.id,
      new Set(),
    );
    const lines = new Map(
      conn.auxiliaryLines.map((line) => [
        line.endpointIds?.join('→'),
        line.edgeType,
      ]),
    );
    expect(lines.get('parent→kidC')).toBe('adoptive');
    expect(lines.get('c→kidC')).toBe('adoptive');
  });
});

describe('partnerships that cannot share a row', () => {
  // Rows hold everyone, each child sits below each of its primary parents,
  // and every recorded partnership is drawn.
  const expectLaidOut = (ped: PedigreeInput) => {
    const result = alignPedigree(ped);
    // Layers are 1-based, so only row 0 is left empty.
    for (let level = 1; level < result.n.length; level++) {
      expect(result.n[level], `row ${level} is empty`).toBeGreaterThan(0);
    }
    ped.parents.forEach((conns, child) => {
      for (const p of conns) {
        if (p.edgeType === 'donor' || p.edgeType === 'surrogate') continue;
        expect(positionOf(result, child)!.layer).toBeGreaterThan(
          positionOf(result, p.parentIndex)!.layer,
        );
      }
    });
    const pairs = (ped.partners ?? []).map(
      (p) =>
        `${Math.min(p.partnerIndex1, p.partnerIndex2)},${Math.max(p.partnerIndex1, p.partnerIndex2)}`,
    );
    const conn = computeConnectors(
      result,
      defaultScaling,
      ped.parents,
      new Set(pairs),
      undefined,
      undefined,
      undefined,
      ped.id,
      new Set(pairs),
    );
    const drawn = conn.groupLines.map((line) =>
      [...(line.partnerIds ?? [])].sort().join(','),
    );
    for (const p of ped.partners ?? []) {
      expect(drawn).toContain(
        [ped.id[p.partnerIndex1]!, ped.id[p.partnerIndex2]!].sort().join(','),
      );
    }
    return result;
  };

  it('lays out a grandparent partnered with their grandchild', () => {
    expectLaidOut({
      id: ['grandparent', 'parent', 'grandchild'],
      parents: [[], [sp(0)], [sp(1)]],
      partners: [{ partnerIndex1: 0, partnerIndex2: 2, isActive: true }],
    });
  });

  it('lays out partnerships that would close a loop across generations', () => {
    // a and b are partners; c is a's child and d is b's parent. c and d
    // partnering too would need a's row both above and level with b's.
    const result = expectLaidOut({
      id: ['a', 'b', 'c', 'd'],
      parents: [[], [sp(3)], [sp(0)], []],
      partners: [
        { partnerIndex1: 0, partnerIndex2: 1, isActive: true },
        { partnerIndex1: 2, partnerIndex2: 3, isActive: true },
      ],
    });
    // The partnership recorded first keeps its row.
    expect(positionOf(result, 0)!.layer).toBe(positionOf(result, 1)!.layer);
  });

  it('routes a partnership across rows clear of everyone between', () => {
    const ped: PedigreeInput = {
      id: ['grandparent', 'parent', 'grandchild'],
      parents: [[], [sp(0)], [sp(1)]],
      partners: [{ partnerIndex1: 0, partnerIndex2: 2, isActive: true }],
    };
    const result = alignPedigree(ped);
    const conn = computeConnectors(
      result,
      defaultScaling,
      ped.parents,
      new Set(['0,2']),
      undefined,
      undefined,
      undefined,
      ped.id,
      new Set(['0,2']),
    );
    const line = conn.groupLines.find(
      (l) =>
        [...(l.partnerIds ?? [])].sort().join() === 'grandchild,grandparent',
    )!;
    const segments = [line.segment, ...(line.endpointSegments ?? [])];
    const parentAt = positionOf(result, 1)!;
    const { boxWidth, boxHeight } = defaultScaling;
    for (const seg of segments) {
      const crossesX =
        Math.min(seg.x1, seg.x2) < parentAt.pos + boxWidth / 2 &&
        Math.max(seg.x1, seg.x2) > parentAt.pos - boxWidth / 2;
      const crossesY =
        Math.min(seg.y1, seg.y2) < parentAt.layer + boxHeight &&
        Math.max(seg.y1, seg.y2) > parentAt.layer;
      expect(crossesX && crossesY, JSON.stringify(seg)).toBe(false);
    }
    expect(line.segment.x1).not.toBe(line.segment.x2);
  });
});

describe('every parent is joined to their child', () => {
  // A child's family names its couple, or its single parent; each other
  // primary parent has a line of its own, to the child or to its sibling bar.
  const expectEveryParentJoined = (ped: PedigreeInput) => {
    const result = alignPedigree(ped);
    const conn = computeConnectors(
      result,
      defaultScaling,
      ped.parents,
      undefined,
      undefined,
      undefined,
      undefined,
      ped.id,
    );
    const direct = new Set(
      conn.auxiliaryLines.map((line) => line.endpointIds?.join('→')),
    );
    for (let level = 1; level < result.n.length; level++) {
      for (let col = 0; col < result.n[level]!; col++) {
        const child = result.nid[level]![col]!;
        const fam = result.fam[level]![col]!;
        const named = new Set<number>();
        if (fam < 0) named.add(result.nid[level - 1]![-fam - 1]!);
        if (fam > 0) {
          named.add(result.nid[level - 1]![fam - 1]!);
          if ((result.group[level - 1]![fam - 1] ?? 0) > 0) {
            named.add(result.nid[level - 1]![fam]!);
          }
        }
        for (const { parentIndex, edgeType } of ped.parents[child]!) {
          if (edgeType === 'donor' || edgeType === 'surrogate') continue;
          if (named.has(parentIndex)) continue;
          const from = ped.id[parentIndex]!;
          expect(
            direct.has(`${from}→${ped.id[child]}`) || direct.has(`${from}→`),
            `${from} to ${ped.id[child]}`,
          ).toBe(true);
        }
      }
    }
  };

  it.each(
    Object.entries(fixtures).filter(
      (entry): entry is [string, PedigreeInput] =>
        typeof entry[1] === 'object' && 'parents' in entry[1],
    ),
  )('in %s', (_name, ped) => {
    expectEveryParentJoined(ped);
  });

  it('when one of two parents who are not partners moves down a row', () => {
    // x partners with y, two generations below; x and an unrelated adoptive
    // parent a have a child together, who follows x down.
    expectEveryParentJoined({
      id: ['g', 'h', 'y', 'x', 'a', 'kid'],
      parents: [
        [],
        [sp(0)],
        [sp(1)],
        [],
        [],
        [sp(3), { parentIndex: 4, edgeType: 'adoptive' }],
      ],
      partners: [{ partnerIndex1: 3, partnerIndex2: 2, isActive: true }],
    });
  });
});

describe('a parent who descends from a co-parent', () => {
  // Every person is drawn exactly once, on a row below each of their parents.
  const expectEveryChildBelowItsParents = (ped: PedigreeInput) => {
    const result = alignPedigree(ped);
    const drawn = result.nid.flatMap((row, level) =>
      row.slice(0, result.n[level]),
    );
    expect(drawn.toSorted((a, b) => a - b)).toStrictEqual(
      ped.id.map((_, i) => i),
    );
    ped.parents.forEach((conns, child) => {
      const childAt = positionOf(result, child);
      expect(childAt).toBeDefined();
      for (const p of conns) {
        expect(childAt!.layer).toBeGreaterThan(
          positionOf(result, p.parentIndex)!.layer,
        );
      }
    });
    return result;
  };

  it('lays out a daughter who carries her mother’s baby', () => {
    expectEveryChildBelowItsParents({
      id: ['mum', 'daughter', 'baby'],
      parents: [
        [],
        [{ parentIndex: 0, edgeType: 'biological' }],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'surrogate', isGestationalCarrier: true },
        ],
      ],
    });
  });

  it('lays out a daughter who carries her parents’ baby', () => {
    expectEveryChildBelowItsParents({
      id: ['mum', 'dad', 'daughter', 'baby'],
      parents: [
        [],
        [],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'biological' },
        ],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'biological' },
          { parentIndex: 2, edgeType: 'surrogate', isGestationalCarrier: true },
        ],
      ],
      partners: [{ partnerIndex1: 0, partnerIndex2: 1, isActive: true }],
    });
  });

  it('lays out a son who donates to his mother and her partner', () => {
    const ped: PedigreeInput = {
      id: ['mum', 'partner', 'son', 'baby'],
      parents: [
        [],
        [],
        [{ parentIndex: 0, edgeType: 'biological' }],
        [
          { parentIndex: 0, edgeType: 'biological' },
          { parentIndex: 1, edgeType: 'social' },
          { parentIndex: 2, edgeType: 'donor' },
        ],
      ],
      partners: [{ partnerIndex1: 0, partnerIndex2: 1, isActive: true }],
    };
    const result = expectEveryChildBelowItsParents(ped);
    expect(positionOf(result, 0)!.layer).toBe(positionOf(result, 1)!.layer);
  });

  it('lays out a grandmother who carries her daughter’s baby', () => {
    expectEveryChildBelowItsParents({
      id: ['grandmother', 'daughter', 'baby'],
      parents: [
        [],
        [{ parentIndex: 0, edgeType: 'biological' }],
        [
          { parentIndex: 1, edgeType: 'biological' },
          { parentIndex: 0, edgeType: 'surrogate', isGestationalCarrier: true },
        ],
      ],
    });
  });
});
