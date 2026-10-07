import type { ParentConnection } from './types';

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
