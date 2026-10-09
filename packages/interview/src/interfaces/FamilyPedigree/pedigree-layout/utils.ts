// Create a 2D array (matrix) with given dimensions and fill value
export function createMatrix<T>(rows: number, cols: number, fill: T): T[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => fill),
  );
}

// R's match(): find index of value in table, returns -1 if not found
export function matchIndex(value: number, table: number[]): number {
  return table.indexOf(value);
}

// R's which(): returns indices where predicate is true
export function which(arr: boolean[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) result.push(i);
  }
  return result;
}

// R's pmin(): parallel minimum of two arrays
export function pmin(a: number[], b: number[]): number[] {
  return a.map((val, i) => Math.min(val, b[i] ?? val));
}

// R's pmax(): parallel maximum of two arrays
export function pmax(a: number[], b: number[]): number[] {
  return a.map((val, i) => Math.max(val, b[i] ?? val));
}

// R's rank(): assign rank to each element (average rank for ties)
export function rank(arr: number[]): number[] {
  const indexed = arr.map((val, i) => ({ val, i }));
  indexed.sort((a, b) => a.val - b.val);

  const ranks: number[] = Array.from({ length: arr.length });
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j]!.val === indexed[i]!.val) {
      j++;
    }
    // Average rank for ties (1-based like R)
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k]!.i] = avgRank;
    }
    i = j;
  }
  return ranks;
}

// R's table(): count occurrences of each value
export function tableCounts(arr: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const val of arr) {
    counts.set(val, (counts.get(val) ?? 0) + 1);
  }
  return counts;
}

import type { ParentConnection, PedigreeEdgeType } from './types';

// Chase all ancestors of a person
export function ancestor(me: number, parents: ParentConnection[][]): number[] {
  const n = parents.length;
  const result: boolean[] = Array.from({ length: n }, () => false);

  // Seed with direct parents
  const myParents = parents[me] ?? [];
  for (const p of myParents) {
    result[p.parentIndex] = true;
  }

  // Chase up iteratively
  for (let iter = 0; iter < n; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (!result[i]) continue;
      for (const p of parents[i] ?? []) {
        if (!result[p.parentIndex]) {
          result[p.parentIndex] = true;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (result[i]) indices.push(i);
  }
  return indices;
}

/** A parent link that passes on genes: a biological parent, or a donor —
 * which includes an adopted child's birth parent, whose biological link the
 * adapter turns into a donor link. Social, adoptive and surrogate links do
 * not. */
function isGeneticEdge(edgeType: PedigreeEdgeType): boolean {
  return edgeType === 'biological' || edgeType === 'donor';
}

/**
 * Whether two people are blood relatives — they share a genetic ancestor —
 * so their partnership is drawn with the double consanguinity line. Only
 * genetic parent links are followed: step-siblings who share a social parent,
 * or adoptive siblings, are not consanguineous.
 */
export function areConsanguineous(
  a: number,
  b: number,
  parents: ParentConnection[][],
): boolean {
  const genetic = parents.map((conns) =>
    conns.filter((p) => isGeneticEdge(p.edgeType)),
  );
  const ancestorsOfB = new Set(ancestor(b, genetic));
  return ancestor(a, genetic).some((x) => ancestorsOfB.has(x));
}

// Chase up ancestors — returns all ancestors reachable from x (including x)
export function chaseup(x: number[], parents: ParentConnection[][]): number[] {
  const n = parents.length;
  const inSet: boolean[] = Array.from({ length: n }, () => false);
  for (const idx of x) inSet[idx] = true;

  for (let iter = 0; iter < n; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (!inSet[i]) continue;
      for (const p of parents[i] ?? []) {
        if (!inSet[p.parentIndex]) {
          inSet[p.parentIndex] = true;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inSet[i]) result.push(i);
  }
  return result;
}

// Check if a value is a group member marker (has .5 fractional part)
export function isGroupMarker(val: number): boolean {
  return val !== Math.floor(val);
}

/**
 * Layer constraints over n people, each asking that `to` sit at least `gap`
 * layers below `from`. Descent (gap 1) is always kept. An alignment (gap 0)
 * is kept only if every constraint can still hold together, which fails
 * exactly when a cycle includes a step down: someone would have to sit level
 * with, or above, their own descendant.
 */
export function layerConstraints(n: number) {
  const below: { to: number; gap: number }[][] = Array.from(
    { length: n },
    () => [],
  );
  const onDescendingCycle = (node: number) => {
    const seen = new Set<string>();
    const queue: [number, boolean][] = [[node, false]];
    while (queue.length > 0) {
      const [at, descended] = queue.shift()!;
      for (const { to, gap } of below[at]!) {
        const next = descended || gap > 0;
        if (to === node && next) return true;
        const key = `${to},${next}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push([to, next]);
      }
    }
    return false;
  };
  return {
    /** Adds the constraints together; returns whether they were kept. */
    constrain(pairs: [from: number, to: number][], gap: number): boolean {
      for (const [from, to] of pairs) below[from]!.push({ to, gap });
      // The constraints held before, so any new cycle passes through these.
      if (gap > 0 || !pairs.some(([from]) => onDescendingCycle(from))) {
        return true;
      }
      for (const [from] of pairs) below[from]!.pop();
      return false;
    },
    /** Raises layers until every kept constraint holds. Layers only ever
     * increase, and with no cycle left to climb this settles within n
     * passes. */
    settle(layers: number[]) {
      for (let changed = true, pass = 0; changed && pass <= n; pass++) {
        changed = false;
        for (let from = 0; from < n; from++) {
          for (const { to, gap } of below[from]!) {
            if (layers[to]! < layers[from]! + gap) {
              layers[to] = layers[from]! + gap;
              changed = true;
            }
          }
        }
      }
    },
  };
}
