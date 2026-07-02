import {
  forceCollide,
  forceSimulation,
  type SimulationNodeDatum,
} from 'd3-force';
import { describe, expect, it } from 'vitest';

import type { VariableOptionValue } from '@codaco/protocol-validation';

import { forceGroupCohesion } from '../forceGroupCohesion';

type TestNode = SimulationNodeDatum & {
  id: string;
  groupKeys?: VariableOptionValue[];
};

function meanPairwiseDistance(nodes: TestNode[]): number {
  if (nodes.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const dx = (nodes[i]!.x ?? 0) - (nodes[j]!.x ?? 0);
      const dy = (nodes[i]!.y ?? 0) - (nodes[j]!.y ?? 0);
      total += Math.hypot(dx, dy);
      pairs += 1;
    }
  }
  return total / pairs;
}

function centroid(nodes: TestNode[]): { x: number; y: number } {
  const x = nodes.reduce((sum, n) => sum + (n.x ?? 0), 0) / nodes.length;
  const y = nodes.reduce((sum, n) => sum + (n.y ?? 0), 0) / nodes.length;
  return { x, y };
}

function runTicks(nodes: TestNode[], ticks: number, withCollide = true) {
  const sim = forceSimulation(nodes)
    .force('group', forceGroupCohesion<TestNode>())
    .alphaDecay(0)
    .velocityDecay(0.3)
    .stop();
  if (withCollide) {
    sim.force('collide', forceCollide(8));
  }
  for (let i = 0; i < ticks; i += 1) {
    sim.tick();
  }
  return sim;
}

describe('forceGroupCohesion', () => {
  it('pulls same-group nodes together: each group is tighter after settling', () => {
    // Group A clustered far left, group B clustered far right.
    const groupA: TestNode[] = [
      { id: 'a1', x: -200, y: 0, groupKeys: ['A'] },
      { id: 'a2', x: -180, y: 60, groupKeys: ['A'] },
      { id: 'a3', x: -160, y: -60, groupKeys: ['A'] },
    ];
    const groupB: TestNode[] = [
      { id: 'b1', x: 200, y: 0, groupKeys: ['B'] },
      { id: 'b2', x: 180, y: 60, groupKeys: ['B'] },
      { id: 'b3', x: 160, y: -60, groupKeys: ['B'] },
    ];
    const nodes = [...groupA, ...groupB];

    const beforeA = meanPairwiseDistance(groupA);
    const beforeB = meanPairwiseDistance(groupB);

    runTicks(nodes, 120);

    expect(meanPairwiseDistance(groupA)).toBeLessThan(beforeA);
    expect(meanPairwiseDistance(groupB)).toBeLessThan(beforeB);
  });

  it('settles a multi-group node bounded between the two group centroids', () => {
    // Group A far left, group B far right, one shared node between them.
    const a1: TestNode = { id: 'a1', x: -200, y: 20, groupKeys: ['A'] };
    const a2: TestNode = { id: 'a2', x: -200, y: -20, groupKeys: ['A'] };
    const b1: TestNode = { id: 'b1', x: 200, y: 20, groupKeys: ['B'] };
    const b2: TestNode = { id: 'b2', x: 200, y: -20, groupKeys: ['B'] };
    const shared: TestNode = { id: 's', x: 0, y: 0, groupKeys: ['A', 'B'] };
    const nodes = [a1, a2, b1, b2, shared];

    runTicks(nodes, 200);

    const cA = centroid([a1, a2]);
    const cB = centroid([b1, b2]);
    const lo = Math.min(cA.x, cB.x);
    const hi = Math.max(cA.x, cB.x);

    // Shared node sits strictly between the two group centroids, not pulled
    // fully into either group.
    expect(shared.x!).toBeGreaterThan(lo);
    expect(shared.x!).toBeLessThan(hi);
  });

  it('lets non-shared members of two bridged groups converge among themselves', () => {
    // Two far-apart groups share exactly ONE bridging node. The shared node
    // must not drag each group's own members apart (centroid-contamination
    // guard): non-shared A members converge, non-shared B members converge.
    const aMembers: TestNode[] = [
      { id: 'a1', x: -200, y: 0, groupKeys: ['A'] },
      { id: 'a2', x: -180, y: 80, groupKeys: ['A'] },
      { id: 'a3', x: -160, y: -80, groupKeys: ['A'] },
    ];
    const bMembers: TestNode[] = [
      { id: 'b1', x: 200, y: 0, groupKeys: ['B'] },
      { id: 'b2', x: 180, y: 80, groupKeys: ['B'] },
      { id: 'b3', x: 160, y: -80, groupKeys: ['B'] },
    ];
    const shared: TestNode = { id: 's', x: 0, y: 0, groupKeys: ['A', 'B'] };
    const nodes = [...aMembers, ...bMembers, shared];

    const beforeA = meanPairwiseDistance(aMembers);
    const beforeB = meanPairwiseDistance(bMembers);

    runTicks(nodes, 200);

    expect(meanPairwiseDistance(aMembers)).toBeLessThan(beforeA);
    expect(meanPairwiseDistance(bMembers)).toBeLessThan(beforeB);
  });

  it('drops a singleton bucket but still pulls the node toward its other group', () => {
    // 'lonely' is the only member of group B (singleton bucket -> dropped) but
    // also a member of 3-node group A; it must still be pulled toward A.
    const aMembers: TestNode[] = [
      { id: 'a1', x: 200, y: 0, groupKeys: ['A'] },
      { id: 'a2', x: 220, y: 40, groupKeys: ['A'] },
      { id: 'a3', x: 180, y: -40, groupKeys: ['A'] },
    ];
    const lonely: TestNode = {
      id: 'lonely',
      x: -200,
      y: 0,
      groupKeys: ['A', 'B'],
    };
    const nodes = [...aMembers, lonely];

    const startDistanceToA = Math.abs(lonely.x! - centroid(aMembers).x);

    runTicks(nodes, 150, false);

    const endDistanceToA = Math.abs(lonely.x! - centroid(aMembers).x);
    expect(endDistanceToA).toBeLessThan(startDistanceToA);
  });

  it('leaves grouped-less nodes untouched (empty or undefined groupKeys)', () => {
    const noKeys: TestNode = {
      id: 'n1',
      x: 10,
      y: 20,
      vx: 0,
      vy: 0,
      groupKeys: [],
    };
    const undef: TestNode = { id: 'n2', x: -10, y: -20, vx: 0, vy: 0 };
    const force = forceGroupCohesion<TestNode>();
    force.initialize?.([noKeys, undef], Math.random);

    force(1);

    expect(noKeys.vx).toBe(0);
    expect(noKeys.vy).toBe(0);
    expect(undef.vx).toBe(0);
    expect(undef.vy).toBe(0);
  });

  it('modifies only velocity, never position, with the expected pull direction', () => {
    // Two-member group: each node is pulled toward the other (the centroid
    // excluding self is the other node's position).
    const left: TestNode = {
      id: 'l',
      x: -100,
      y: 0,
      vx: 0,
      vy: 0,
      groupKeys: ['A'],
    };
    const right: TestNode = {
      id: 'r',
      x: 100,
      y: 0,
      vx: 0,
      vy: 0,
      groupKeys: ['A'],
    };
    const force = forceGroupCohesion<TestNode>().strength(0.2);
    force.initialize?.([left, right], Math.random);

    force(0.5);

    // Positions are untouched by the force itself.
    expect(left.x).toBe(-100);
    expect(left.y).toBe(0);
    expect(right.x).toBe(100);
    expect(right.y).toBe(0);

    // left is pulled rightward (toward right), right is pulled leftward.
    expect(left.vx!).toBeGreaterThan(0);
    expect(right.vx!).toBeLessThan(0);
    // Symmetric magnitudes, no y component.
    expect(left.vx!).toBeCloseTo(-right.vx!, 10);
    expect(left.vy).toBe(0);
    expect(right.vy).toBe(0);

    // Magnitude: (cx - x) * strength * alpha / g
    //   = (100 - (-100)) * 0.2 * 0.5 / 1 = 20
    expect(left.vx!).toBeCloseTo(20, 10);
  });

  it('is deterministic: identical input run twice produces identical positions', () => {
    const build = (): TestNode[] => [
      { id: 'a1', x: -200, y: 0, groupKeys: ['A'] },
      { id: 'a2', x: -180, y: 60, groupKeys: ['A'] },
      { id: 'a3', x: -160, y: -60, groupKeys: ['A'] },
      { id: 'b1', x: 200, y: 0, groupKeys: ['B'] },
      { id: 'b2', x: 180, y: 60, groupKeys: ['B'] },
      { id: 's', x: 0, y: 0, groupKeys: ['A', 'B'] },
    ];

    const first = build();
    runTicks(first, 80);
    const second = build();
    runTicks(second, 80);

    for (let i = 0; i < first.length; i += 1) {
      expect(first[i]!.x).toBe(second[i]!.x);
      expect(first[i]!.y).toBe(second[i]!.y);
    }
  });
});
