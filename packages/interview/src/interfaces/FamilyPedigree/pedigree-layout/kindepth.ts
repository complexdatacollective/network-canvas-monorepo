import type { ParentConnection } from './types';
import { chaseup } from './utils';

/**
 * Compute the generational depth of each subject in a pedigree.
 * Depth = max number of generations to farthest founder ancestor.
 *
 * When align=true, adjusts depths so parent group members plot on the same line.
 *
 * @param parents - parents[i] = array of parent connections for person i
 * @param align - whether to align parent group depths
 */
export function kindepth(
  parents: ParentConnection[][],
  align = false,
): number[] {
  const n = parents.length;
  if (n === 1) return [0];

  // Founders: people with no parents
  const currentLevel: number[] = [];
  for (let i = 0; i < n; i++) {
    if (parents[i]!.length === 0) {
      currentLevel.push(i);
    }
  }

  // If no founders exist but there are people, it's cyclic
  if (currentLevel.length === 0) {
    throw new Error('Impossible pedigree: someone is their own ancestor');
  }

  // Assign depth = max(parent depths) + 1 using topological ordering.
  // A child is only assigned once ALL its parents have depths.
  const depth: number[] = Array.from({ length: n }, () => 0);
  const assigned = new Set<number>(currentLevel);

  for (let pass = 0; pass < n; pass++) {
    let progress = false;
    for (let j = 0; j < n; j++) {
      if (assigned.has(j)) continue;
      const personParents = parents[j]!;
      if (personParents.length === 0) continue;
      const allAssigned = personParents.every((p) =>
        assigned.has(p.parentIndex),
      );
      if (!allAssigned) continue;

      const maxParentDepth = Math.max(
        ...personParents.map((p) => depth[p.parentIndex]!),
      );
      depth[j] = maxParentDepth + 1;
      assigned.add(j);
      progress = true;
    }
    if (!progress) break;
  }

  if (!align) return depth;

  // --- Alignment: adjust depths so parent group members are on the same line ---

  // Push every child below each of its parents after a move, repeating
  // because a pushed child pushes its own children in turn.
  const pushChildrenBelowParents = () => {
    for (let pass = 0; pass < n; pass++) {
      let changed = false;
      for (let j = 0; j < n; j++) {
        for (const p of parents[j]!) {
          if (depth[j]! <= depth[p.parentIndex]!) {
            depth[j] = depth[p.parentIndex]! + 1;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  };

  // Collect all parent groups (unique sets of parents who share children).
  // A child sits below each of its parents, so a parent who descends from
  // another of the same child's parents (a daughter carrying her mother's
  // baby) can never share their row; they are left out of the group.
  const groupSet = new Set<string>();
  const groups: number[][] = [];

  for (let i = 0; i < n; i++) {
    if (parents[i]!.length < 2) continue;
    const parentIndices = parents[i]!.map((p) => p.parentIndex);
    const memberIndices = parentIndices
      .filter((m) => {
        const ancestors = chaseup([m], parents);
        return parentIndices.every(
          (other) => other === m || !ancestors.includes(other),
        );
      })
      .toSorted((a, b) => a - b);
    if (memberIndices.length < 2) continue;
    const key = memberIndices.join(',');
    if (!groupSet.has(key)) {
      groupSet.add(key);
      groups.push(memberIndices);
    }
  }

  const ngroups = groups.length;
  const done: boolean[] = Array.from({ length: ngroups }, () => false);

  for (;;) {
    // Find groups where members have different depths
    const groupsToFix: number[] = [];
    for (let i = 0; i < ngroups; i++) {
      if (done[i]) continue;
      const members = groups[i]!;
      const depths = members.map((m) => depth[m]!);
      if (Math.min(...depths) !== Math.max(...depths)) {
        groupsToFix.push(i);
      }
    }
    if (groupsToFix.length === 0) break;

    // Pick the group with smallest max depth
    const maxDepths = groupsToFix.map((idx) => {
      const members = groups[idx]!;
      return Math.max(...members.map((m) => depth[m]!));
    });
    const minMax = Math.min(...maxDepths);
    const who = groupsToFix.find((idx) => {
      const members = groups[idx]!;
      return Math.max(...members.map((m) => depth[m]!)) === minMax;
    })!;

    const members = groups[who]!;
    const memberDepths = members.map((m) => depth[m]!);
    const maxDepth = Math.max(...memberDepths);

    // "good" = member with highest depth (closer to children)
    // "bad" = member with lowest depth (needs to be pushed down)
    const good = members[memberDepths.indexOf(maxDepth)]!;
    const bad = members.find((m) => depth[m] !== maxDepth)!;

    const abad = chaseup([bad], parents);

    // Simple case: solitary marry-in
    const badAppearances = groups.filter((g) => g.includes(bad)).length;
    if (abad.length === 1 && badAppearances === 1) {
      depth[bad] = depth[good]!;
      // A marry-in may still have children of their own outside this group.
      pushChildrenBelowParents();
    } else {
      let agood = chaseup([good], parents);

      // Chase group members and their ancestors, excluding the given group
      const otherGroups = groups.filter((_, i) => i !== who);

      for (;;) {
        // Find group co-members of anyone in agood
        const coMembers: number[] = [];
        for (const g of otherGroups) {
          const overlap = g.some((m) => agood.includes(m));
          if (overlap) {
            for (const m of g) {
              coMembers.push(m);
            }
          }
        }

        let temp = [...new Set([...agood, ...coMembers])];
        temp = [...new Set(chaseup(temp, parents))];

        // Add kids at or above good's depth
        for (let j = 0; j < n; j++) {
          const personParents = parents[j]!;
          if (personParents.length === 0) continue;
          const hasParentInTemp = personParents.some((p) =>
            temp.includes(p.parentIndex),
          );
          if (hasParentInTemp && depth[j]! <= depth[good]!) {
            temp = [...new Set([...temp, j])];
          }
        }

        if (temp.length === agood.length) break;
        agood = temp;
      }

      // Only shift if no overlap between abad and agood
      if (!abad.some((a) => agood.includes(a))) {
        const shift = depth[good]! - depth[bad]!;
        for (const idx of abad) {
          depth[idx] = depth[idx]! + shift;
        }

        pushChildrenBelowParents();
      }
    }

    // Mark groups involving 'bad' as done
    for (let i = 0; i < ngroups; i++) {
      if (groups[i]!.includes(bad)) {
        done[i] = true;
      }
    }
  }

  if (depth.every((d) => d > 0)) {
    throw new Error("Bug in kindepth's alignment code");
  }

  return depth;
}
