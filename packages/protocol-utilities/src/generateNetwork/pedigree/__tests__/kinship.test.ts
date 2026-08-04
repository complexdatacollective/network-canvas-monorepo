import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEMOGRAPHY,
  type Rng,
  sampleSibshipOfKnownChild,
  sampleSibshipOfKnownParent,
} from '../demography.ts';
import { type AbstractPedigree, buildKinshipSkeleton } from '../kinship.ts';

/** mulberry32 — small, seeded, and good enough for distributional checks. */
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

function build(seed: number): AbstractPedigree {
  return buildKinshipSkeleton(makeRng(seed), DEFAULT_DEMOGRAPHY);
}

/**
 * The same family with every branch recorded.
 *
 * The register figures count a person's *actual* living kin; a pedigree records
 * only what the participant can name, and `grandparentsRecordedRate` is what
 * separates the two. Calibration belongs against the underlying family, so this
 * turns the recording rate off before comparing.
 */
function buildFullyRecorded(seed: number): AbstractPedigree {
  return buildKinshipSkeleton(makeRng(seed), {
    ...DEFAULT_DEMOGRAPHY,
    grandparentsRecordedRate: 1,
  });
}

/** People in ego's generation who descend from a grandparental couple. */
function cousinCount(pedigree: AbstractPedigree): number {
  return pedigree.people.filter((person) => person.id.includes('cousin'))
    .length;
}

describe('kinship skeleton', () => {
  it('records either both parents or neither, and marks founders accordingly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pedigree = build(seed);
      // A person either has no parents recorded — which makes them a founder,
      // and is normal wherever an ascent stops — or has a full pair.
      for (const person of pedigree.people) {
        const links = pedigree.parents.get(person.id) ?? [];
        expect(
          links.length === 0 || links.length === 2,
          `seed ${seed}, ${person.id}`,
        ).toBe(true);
        expect(person.isFounder, `seed ${seed}, ${person.id}`).toBe(
          links.length === 0,
        );
      }
    }
  });

  it('gives ego two parents on every seed — the interface will not finalize otherwise', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pedigree = build(seed);
      expect(pedigree.parents.get(pedigree.egoId) ?? []).toHaveLength(2);
    }
  });

  it('assigns exactly one egg and one sperm contributor per child', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pedigree = build(seed);
      for (const [childId, links] of pedigree.parents) {
        const roles = links
          .map((link) => link.gameteRole)
          .toSorted((a, b) => String(a).localeCompare(String(b)));
        expect(roles, `seed ${seed}, ${childId}`).toEqual(['egg', 'sperm']);
      }
    }
  });

  it('agrees gamete role with the contributor sex', () => {
    const pedigree = build(7);
    const sexById = new Map(pedigree.people.map((p) => [p.id, p.sex]));
    for (const links of pedigree.parents.values()) {
      for (const link of links) {
        if (link.gameteRole === 'egg') {
          expect(sexById.get(link.parent)).toBe('female');
        }
        if (link.gameteRole === 'sperm') {
          expect(sexById.get(link.parent)).toBe('male');
        }
      }
    }
  });

  it('marks exactly one ego', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const pedigree = build(seed);
      expect(pedigree.people.filter((person) => person.isEgo)).toHaveLength(1);
    }
  });

  // The Swedish full-population register study (Kolk et al., Demography 2023)
  // is the only empirical kinship enumeration of a complete population: a
  // person in their mid-30s has ~8 cousins on average, and ~30% have 11 or
  // more. Reproducing that is the real proof the demography works — the
  // invariants above only prove the pedigree is well-formed, not plausible.
  //
  // Matching the *distribution* and not just the mean is what the cohort-
  // specific fertility buys. Using today's rate throughout gives a mean near 5.
  it('matches the empirical cousin distribution', () => {
    const runs = 4000;
    let total = 0;
    let withElephantSibships = 0;
    for (let seed = 1; seed <= runs; seed++) {
      const cousins = cousinCount(buildFullyRecorded(seed));
      total += cousins;
      if (cousins >= 11) withElephantSibships += 1;
    }

    expect(total / runs).toBeGreaterThan(7);
    expect(total / runs).toBeLessThan(10);
    expect(withElephantSibships / runs).toBeGreaterThan(0.2);
    expect(withElephantSibships / runs).toBeLessThan(0.4);
  });

  // Total pedigree size runs above the ~20 *living* kin the register reports,
  // which is expected: a pedigree includes the dead, and the grandparental
  // generation largely is.
  it('produces a plausible mean pedigree size', () => {
    const runs = 2000;
    let total = 0;
    for (let seed = 1; seed <= runs; seed++) {
      total += buildFullyRecorded(seed).people.length;
    }
    const mean = total / runs;
    expect(mean).toBeGreaterThan(18);
    expect(mean).toBeLessThan(45);
  });
});

describe('fertility sampling', () => {
  it('never returns zero for a known parent', () => {
    const rng = makeRng(3);
    for (let draw = 0; draw < 2000; draw++) {
      expect(
        sampleSibshipOfKnownParent(rng, DEFAULT_DEMOGRAPHY),
      ).toBeGreaterThanOrEqual(1);
    }
  });

  // A randomly chosen child comes from a larger sibship than a randomly chosen
  // parent has, because large sibships contain more children. Ignoring this
  // under-produces large families, and cousin counts scale with roughly the
  // square of the reproductive rate, so the error compounds a generation out.
  it('draws a larger sibship for a known child than for a known parent', () => {
    const runs = 20000;
    let childTotal = 0;
    let parentTotal = 0;
    const rng = makeRng(11);
    for (let draw = 0; draw < runs; draw++) {
      childTotal += sampleSibshipOfKnownChild(rng, DEFAULT_DEMOGRAPHY);
      parentTotal += sampleSibshipOfKnownParent(rng, DEFAULT_DEMOGRAPHY);
    }
    expect(childTotal / runs).toBeGreaterThan(parentTotal / runs);
  });
});
