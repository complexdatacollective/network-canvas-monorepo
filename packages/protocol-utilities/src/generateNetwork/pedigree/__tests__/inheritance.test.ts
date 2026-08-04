import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMOGRAPHY,
  type Rng,
  SHOWCASE_DEMOGRAPHY,
} from '../demography.ts';
import { computeAffected } from '../inheritance.ts';
import { type AbstractPedigree, buildKinshipSkeleton } from '../kinship.ts';
import { applyParentageVariants } from '../variants.ts';

function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    randomFloat: (min, max) => min + next() * (max - min),
    randomInt: (min, max) => min + Math.floor(next() * (max - min + 1)),
  };
}

function build(seed: number, showcase = false): AbstractPedigree {
  const rng = makeRng(seed);
  const demography = showcase ? SHOWCASE_DEMOGRAPHY : DEFAULT_DEMOGRAPHY;
  return applyParentageVariants(
    rng,
    demography,
    buildKinshipSkeleton(rng, demography),
  );
}

function geneticParent(
  pedigree: AbstractPedigree,
  childId: string,
  role: 'egg' | 'sperm',
): string | undefined {
  return (pedigree.parents.get(childId) ?? []).find(
    (link) =>
      link.gameteRole === role &&
      (link.relationshipType === 'biological' ||
        link.relationshipType === 'donor'),
  )?.parent;
}

describe('parentage variants', () => {
  it('keeps at least two parents on every non-founder', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const pedigree = build(seed, true);
      for (const person of pedigree.people) {
        if (person.isFounder) continue;
        const links = pedigree.parents.get(person.id) ?? [];
        expect(links.length, `seed ${seed}, ${person.id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('never gives a gamete role to a surrogate or adoptive link', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const pedigree = build(seed, true);
      for (const links of pedigree.parents.values()) {
        for (const link of links) {
          if (
            link.relationshipType === 'surrogate' ||
            link.relationshipType === 'adoptive' ||
            link.relationshipType === 'social'
          ) {
            expect(link.gameteRole).toBeUndefined();
          }
        }
      }
    }
  });

  it('gives every child exactly one gestational carrier', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const pedigree = build(seed, true);
      for (const [childId, links] of pedigree.parents) {
        const carriers = links.filter(
          (link) => link.isGestationalCarrier === true,
        );
        // An adopted child has no pregnancy recorded on the pedigree at all.
        const adopted = links.every(
          (link) => link.relationshipType === 'adoptive',
        );
        expect(carriers.length, `seed ${seed}, ${childId}`).toBe(adopted ? 0 : 1);
      }
    }
  });

  it('keeps at most one egg and one sperm contributor per child', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const pedigree = build(seed, true);
      for (const [childId, links] of pedigree.parents) {
        const eggs = links.filter((link) => link.gameteRole === 'egg');
        const sperm = links.filter((link) => link.gameteRole === 'sperm');
        expect(eggs.length, `seed ${seed}, ${childId} eggs`).toBeLessThanOrEqual(1);
        expect(sperm.length, `seed ${seed}, ${childId} sperm`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('exercises every arrangement across a run of showcase pedigrees', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const links of build(seed, true).parents.values()) {
        for (const link of links) seen.add(link.relationshipType);
      }
    }
    expect([...seen].sort()).toEqual(
      expect.arrayContaining(['adoptive', 'biological', 'donor', 'surrogate']),
    );
  });
});

describe('inheritance', () => {
  // The defining property of a dominant condition: nobody is affected without
  // an affected genetic parent. If this holds, the pathway the interface draws
  // is real rather than decorative.
  it('gives every affected person an affected genetic parent, under dominance', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const pedigree = build(seed);
      const affected = computeAffected(
        makeRng(seed + 5000),
        pedigree,
        'autosomalDominant',
      );

      for (const id of affected) {
        const parents = pedigree.parents.get(id) ?? [];
        if (parents.length === 0) continue; // a seeded founder

        const egg = geneticParent(pedigree, id, 'egg');
        const sperm = geneticParent(pedigree, id, 'sperm');
        if (egg === undefined && sperm === undefined) continue; // adopted

        expect(
          (egg !== undefined && affected.has(egg)) ||
            (sperm !== undefined && affected.has(sperm)),
          `seed ${seed}: ${id} affected with no affected genetic parent`,
        ).toBe(true);
      }
    }
  });

  it('affects only males, down the male line, when Y-linked', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const pedigree = build(seed);
      const sexById = new Map(pedigree.people.map((p) => [p.id, p.sex]));
      const affected = computeAffected(
        makeRng(seed + 5000),
        pedigree,
        'yLinked',
      );

      for (const id of affected) {
        expect(sexById.get(id), `seed ${seed}, ${id}`).toBe('male');
        const sperm = geneticParent(pedigree, id, 'sperm');
        if (sperm === undefined) continue;
        expect(affected.has(sperm), `seed ${seed}, ${id}`).toBe(true);
      }
    }
  });

  it('follows the egg alone when mitochondrial', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const pedigree = build(seed);
      const affected = computeAffected(
        makeRng(seed + 5000),
        pedigree,
        'mitochondrial',
      );

      for (const id of affected) {
        const egg = geneticParent(pedigree, id, 'egg');
        if (egg === undefined) continue;
        expect(affected.has(egg), `seed ${seed}, ${id}`).toBe(true);
      }
    }
  });

  it('never affects an adopted child through descent', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pedigree = build(seed, true);
      const affected = computeAffected(
        makeRng(seed + 5000),
        pedigree,
        'autosomalDominant',
      );

      for (const [childId, links] of pedigree.parents) {
        const adopted =
          links.length > 0 &&
          links.every((link) => link.relationshipType === 'adoptive');
        if (adopted) {
          expect(affected.has(childId), `seed ${seed}, ${childId}`).toBe(false);
        }
      }
    }
  });

  it('produces affected people for every transmitting pattern', () => {
    const patterns = [
      'autosomalDominant',
      'autosomalRecessive',
      'xLinkedDominant',
      'xLinkedRecessive',
      'yLinked',
      'mitochondrial',
    ] as const;

    for (const pattern of patterns) {
      let withAffected = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const pedigree = build(seed);
        if (computeAffected(makeRng(seed + 99), pedigree, pattern).size > 0) {
          withAffected += 1;
        }
      }
      // Not every seed need manifest — a recessive condition can fail to
      // surface — but a pattern that never shows anything is broken.
      expect(withAffected, `${pattern} never produced an affected person`).toBeGreaterThan(0);
    }
  });

  it('infers nothing for multifactorial and unknown', () => {
    const pedigree = build(3);
    for (const pattern of ['multifactorial', 'unknown'] as const) {
      const affected = computeAffected(makeRng(7), pedigree, pattern);
      // Sampled independently, so the count is not tied to descent; it just
      // must not be everybody or nobody on a pedigree this size.
      expect(affected.size).toBeLessThan(pedigree.people.length);
    }
  });
});
