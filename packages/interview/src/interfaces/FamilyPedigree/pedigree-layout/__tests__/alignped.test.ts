import { describe, expect, it } from 'vitest';

import { recursiveOrdering } from '../alignped';
import type { PedigreeInput } from '../types';
import { multipleMarriages, nuclearFamily, threeGeneration } from './fixtures';

// Structural guards for the recursive (kinship2-style) ordering. This module is
// a work-in-progress replacement for the barycentric ordering; these tests pin
// the invariants it must always satisfy (every person placed once on their own
// generation, generations well-formed) independent of the prettiness passes
// (autohint / duplicate rendering) still to come. See
// docs/superpowers/specs/2026-07-07-recursive-pedigree-layout-design.md.

const FIXTURES: { name: string; ped: PedigreeInput }[] = [
  { name: 'nuclear family', ped: nuclearFamily },
  { name: 'three generations', ped: threeGeneration },
  { name: 'multiple marriages', ped: multipleMarriages },
];

describe('recursiveOrdering — structural invariants', () => {
  for (const { name, ped } of FIXTURES) {
    describe(name, () => {
      const ordering = recursiveOrdering(ped);

      it('places every person exactly once', () => {
        const seen = ordering.flat();
        expect(seen.toSorted((a, b) => a - b)).toEqual(
          Array.from({ length: ped.id.length }, (_, i) => i),
        );
      });

      it('has no duplicate within a generation', () => {
        for (const row of ordering) {
          expect(new Set(row).size).toBe(row.length);
        }
      });

      it('keeps a person on a single generation row', () => {
        // Each person appears in exactly one row of the ordering.
        const rowOf = new Map<number, number>();
        ordering.forEach((row, r) => {
          for (const person of row) {
            expect(rowOf.has(person)).toBe(false);
            rowOf.set(person, r);
          }
        });
      });
    });
  }

  it('groups a married couple on the same generation', () => {
    // nuclearFamily: parents 0 and 1 are a couple; both land on the top row.
    const ordering = recursiveOrdering(nuclearFamily);
    const rowOf = (p: number) => ordering.findIndex((row) => row.includes(p));
    expect(rowOf(0)).toBe(rowOf(1));
  });

  // KNOWN GAP (WIP): a consanguineous union (a couple who share ancestors) is a
  // loop; the recursion currently drops the looped descendants. Handling loops
  // via kinship2's duplicate-and-arc mechanism is a pending stage of the port —
  // see the design doc. Once implemented, fold `consanguineousUnion` back into
  // FIXTURES and delete this todo.
  it.todo('places everyone in a consanguineous union (loop handling pending)');
});
