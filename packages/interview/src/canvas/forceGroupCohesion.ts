import type { Force, SimulationNodeDatum } from 'd3-force';

import type { VariableOptionValue } from '@codaco/protocol-validation';

const DEFAULT_STRENGTH = 0.1;

/**
 * A simulation node that may declare membership of one or more groups. The
 * `groupKeys` property is attached to each node by the caller (mirroring the
 * convex-hull membership derived via `getGroupKeys`); a node with no/empty
 * `groupKeys` is never moved by this force.
 */
export type GroupCohesionNode = SimulationNodeDatum & {
  groupKeys?: VariableOptionValue[];
};

/** A d3-force `Force` extended with this force's chainable configuration. */
export type GroupCohesionForce<N extends GroupCohesionNode> = Force<
  N,
  undefined
> & {
  strength(): number;
  strength(value: number): GroupCohesionForce<N>;
};

/**
 * Custom d3-force that pulls each node toward the live centroid of every group
 * it belongs to. Unlike off-the-shelf clustering forces, it supports a node
 * belonging to multiple groups by summing a partial pull toward each group's
 * centroid, each scaled by 1/groupCount so multi-group nodes are not yanked
 * harder than single-group nodes. Each centroid is computed excluding the node
 * itself, so a shared node cannot bias the centroid it is pulled toward.
 */
export function forceGroupCohesion<
  N extends GroupCohesionNode,
>(): GroupCohesionForce<N> {
  let nodes: N[] = [];
  let strength = DEFAULT_STRENGTH;

  // Surviving buckets (>= 2 members) keyed by group value.
  let buckets = new Map<VariableOptionValue, N[]>();
  // Per-node: the surviving buckets it belongs to.
  let nodeGroups = new Map<N, N[][]>();

  function initialize(initNodes: N[]) {
    nodes = initNodes;

    const rawBuckets = new Map<VariableOptionValue, N[]>();
    for (const node of nodes) {
      const keys = node.groupKeys;
      if (!keys || keys.length === 0) continue;
      // Dedupe per node so a duplicated value can't add a node to a bucket twice.
      const uniqueKeys = new Set(keys);
      for (const key of uniqueKeys) {
        let bucket = rawBuckets.get(key);
        if (!bucket) {
          bucket = [];
          rawBuckets.set(key, bucket);
        }
        bucket.push(node);
      }
    }

    // Per-bucket singleton drop: a group with fewer than 2 members exerts no
    // cohesion (and would divide by zero in the excluding-self centroid).
    buckets = new Map();
    for (const [key, members] of rawBuckets) {
      if (members.length >= 2) buckets.set(key, members);
    }

    // Precompute each node's surviving buckets.
    nodeGroups = new Map();
    for (const members of buckets.values()) {
      for (const node of members) {
        let groups = nodeGroups.get(node);
        if (!groups) {
          groups = [];
          nodeGroups.set(node, groups);
        }
        groups.push(members);
      }
    }
  }

  function apply(alpha: number) {
    // Pass 1: accumulate each surviving bucket's centroid sums.
    const sums = new Map<N[], { sumX: number; sumY: number; count: number }>();
    for (const members of buckets.values()) {
      let sumX = 0;
      let sumY = 0;
      for (const node of members) {
        sumX += node.x ?? 0;
        sumY += node.y ?? 0;
      }
      sums.set(members, { sumX, sumY, count: members.length });
    }

    // Pass 2: accumulate velocity toward each group's excluding-self centroid.
    for (const node of nodes) {
      const groups = nodeGroups.get(node);
      if (!groups) continue;
      const g = groups.length;
      if (g === 0) continue;

      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      for (const members of groups) {
        const sum = sums.get(members);
        if (!sum) continue;
        const { sumX, sumY, count } = sum;
        // count >= 2 (singleton buckets dropped), so denominator >= 1.
        const cx = (sumX - nx) / (count - 1);
        const cy = (sumY - ny) / (count - 1);
        node.vx = (node.vx ?? 0) + ((cx - nx) * strength * alpha) / g;
        node.vy = (node.vy ?? 0) + ((cy - ny) * strength * alpha) / g;
      }
    }
  }

  function setStrength(value: number): GroupCohesionForce<N>;
  function setStrength(): number;
  function setStrength(value?: number): number | GroupCohesionForce<N> {
    if (value === undefined) return strength;
    strength = value;
    return force;
  }

  const force: GroupCohesionForce<N> = Object.assign(apply, {
    initialize,
    strength: setStrength,
  });

  return force;
}
