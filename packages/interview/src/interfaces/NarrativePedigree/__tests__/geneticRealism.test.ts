import { describe, expect, it } from 'vitest';

import type { InheritancePattern } from '@codaco/shared-consts';

import { buildComprehensivePedigree } from '../comprehensivePedigreeFixture';
import {
  computeAtRiskHomozygous,
  computeStatuses,
} from '../genetics/computeStatuses';
import { buildGeneticGraph } from '../genetics/geneticGraph';
import { resolveSex } from '../genetics/resolveSex';
import { affectedSet, type Status } from '../genetics/status';

// Guards that the comprehensive example is GENETICALLY COHERENT for every
// condition — each affected person has the carrier/affected source in their own
// shown ancestry, each branch computes the pattern the fixture docstring
// promises, and the six patterns COLLECTIVELY surface every notation symbol
// (including the two the plain view previously never reached: "will develop it"
// (obligateAffected) and the "two copies" homozygous marker). Runs the real
// engine on the seeded fixture.

const CFG = {
  biologicalSexVariable: 'biologicalSex',
  gameteRoleVariable: 'gameteRole',
  relationshipTypeVariable: 'relType',
};

const CONDITIONS: { variable: string; pattern: InheritancePattern }[] = [
  { variable: 'hasHuntingtons', pattern: 'autosomalDominant' },
  { variable: 'hasCysticFibrosis', pattern: 'autosomalRecessive' },
  { variable: 'hasHaemophilia', pattern: 'xLinkedRecessive' },
  { variable: 'hasHypophosphataemia', pattern: 'xLinkedDominant' },
  { variable: 'hasYLinkedHearingLoss', pattern: 'yLinked' },
  { variable: 'hasMitochondrialMyopathy', pattern: 'mitochondrial' },
];

// The fixture is deterministic for a fixed seed (guarded by
// comprehensivePedigreeFixture.test.ts) and the genetics functions never mutate
// the graph, so the engine is built once and shared across the whole suite.
function buildEngine() {
  const { nodes, edges } = buildComprehensivePedigree(1).getNetwork();
  const resolveSexFn = (id: string) => resolveSex(id, nodes, edges, CFG);
  const graph = buildGeneticGraph(nodes, edges, CFG, resolveSexFn);
  const statusesFor = (variable: string, pattern: InheritancePattern) =>
    computeStatuses(graph, affectedSet(nodes, variable), pattern, resolveSexFn);
  const homozygousFor = (variable: string, pattern: InheritancePattern) => {
    const statuses = statusesFor(variable, pattern);
    return computeAtRiskHomozygous(graph, statuses, pattern, resolveSexFn);
  };
  const statusOf =
    (variable: string, pattern: InheritancePattern) =>
    (uid: string): Status =>
      statusesFor(variable, pattern).get(uid) ?? 'unknown';
  return { nodes, graph, statusesFor, homozygousFor, statusOf };
}

const engine = buildEngine();

describe('comprehensive example — every symbol and every pattern', () => {
  it('surfaces every notation symbol across the six conditions', () => {
    const { statusesFor, homozygousFor } = engine;
    const seen = new Set<Status>();
    let seenHomozygous = false;
    for (const c of CONDITIONS) {
      for (const s of statusesFor(c.variable, c.pattern).values()) {
        seen.add(s);
      }
      for (const flagged of homozygousFor(c.variable, c.pattern).values()) {
        if (flagged) seenHomozygous = true;
      }
    }
    // The certain markers plus the two at-risk markers.
    for (const status of [
      'affected',
      'obligateAffected',
      'obligateCarrier',
      'atRiskAffected',
      'atRiskCarrier',
    ] as const) {
      expect(seen.has(status), `status ${status} should appear`).toBe(true);
    }
    // The "two copies" homozygous marker.
    expect(seenHomozygous).toBe(true);
  });

  it("Huntington's (autosomal dominant) sweeps the maternal line to ego's children", () => {
    const status = engine.statusOf('hasHuntingtons', 'autosomalDominant');
    expect(status('mgf')).toBe('affected'); // Arthur
    expect(status('mother')).toBe('affected'); // Rose
    expect(status('ego')).toBe('atRiskAffected');
    expect(status('son')).toBe('atRiskAffected');
    expect(status('daughter')).toBe('atRiskAffected');
    // Married-in and paternal-line people carry no HD allele.
    expect(status('father')).toBe('unknown'); // David (married in)
    expect(status('partner')).toBe('unknown'); // Chris
  });

  it('Mitochondrial: matrilineal, and males do not transmit', () => {
    const status = engine.statusOf('hasMitochondrialMyopathy', 'mitochondrial');
    expect(status('mgm')).toBe('affected'); // Eleanor
    expect(status('mother')).toBe('atRiskAffected');
    expect(status('ego')).toBe('atRiskAffected');
    // An at-risk MALE (Frank) does not pass mtDNA to his child (Michael)...
    expect(status('unc1')).toBe('atRiskAffected'); // Frank
    expect(status('c1')).toBe('unknown'); // Michael (via Frank)
    // ...but an at-risk FEMALE (Nancy) passes it to her daughter (Laura).
    expect(status('c2')).toBe('atRiskAffected'); // Laura (via Nancy)
  });

  it("Y-linked descends the Sullivan male line and infers the youngest boy 'will develop it'", () => {
    const status = engine.statusOf('hasYLinkedHearingLoss', 'yLinked');
    expect(status('pgf')).toBe('affected'); // Harold
    expect(status('father')).toBe('affected'); // David
    expect(status('brother')).toBe('affected'); // Ben
    expect(status('nephew')).toBe('obligateAffected'); // Owen — will develop it
    // A female is never on the Y line; ego's son gets Chris's (unaffected) Y.
    expect(status('ego')).toBe('unknown');
    expect(status('son')).toBe('unknown'); // Noah
  });

  it("Haemophilia (X-linked recessive): two affected brothers make their mother an obligate carrier; the line reaches ego's children", () => {
    const status = engine.statusOf('hasHaemophilia', 'xLinkedRecessive');
    expect(status('unc1')).toBe('affected'); // Frank
    expect(status('unc2')).toBe('affected'); // George
    expect(status('mgm')).toBe('obligateCarrier'); // Eleanor (2 affected sons)
    expect(status('mother')).toBe('atRiskCarrier'); // Rose
    expect(status('ego')).toBe('atRiskCarrier');
    expect(status('daughter')).toBe('atRiskCarrier'); // Ava
    expect(status('son')).toBe('atRiskAffected'); // Noah (son of a carrier)
  });

  it("X-linked dominant: an affected male's daughters all 'will develop it', his son is spared", () => {
    const status = engine.statusOf('hasHypophosphataemia', 'xLinkedDominant');
    expect(status('pf')).toBe('affected'); // Walter
    expect(status('psis')).toBe('obligateAffected'); // Paula — will develop it
    expect(status('pnephew')).toBe('atRiskAffected'); // Ethan (Paula transmits on)
    expect(status('partner')).toBe('unknown'); // Chris (son of affected male)
    // So ego's children are spared this X-linked condition.
    expect(status('son')).toBe('unknown');
    expect(status('daughter')).toBe('unknown');
  });

  it('Cystic fibrosis: the consanguineous cousin union yields an affected child and an at-risk-homozygous sibling', () => {
    const { statusOf, homozygousFor } = engine;
    const status = statusOf('hasCysticFibrosis', 'autosomalRecessive');
    expect(status('cfchild')).toBe('affected'); // Sophie
    expect(status('c1')).toBe('obligateCarrier'); // Michael
    expect(status('c2')).toBe('obligateCarrier'); // Laura
    expect(status('cfsib')).toBe('atRiskAffected'); // Daniel
    // The unaffected sibling carries the "two copies" homozygous risk.
    const homozygous = homozygousFor('hasCysticFibrosis', 'autosomalRecessive');
    expect(homozygous.get('cfsib')).toBe(true);
    // The carrier alleles trace to a collateral carrier on each cousin's side.
    expect(status('unc1')).toBe('atRiskCarrier'); // Frank
    expect(status('aunt')).toBe('atRiskCarrier'); // Nancy
  });

  it('the consanguineous CF union is wired: the cousins share the Marsh grandparents', () => {
    const { graph } = engine;
    const c1Parents = new Set(graph.parentsOf('c1').map((p) => p.id));
    const c2Parents = new Set(graph.parentsOf('c2').map((p) => p.id));
    expect(c1Parents.has('unc1')).toBe(true); // Michael via Frank
    expect(c2Parents.has('aunt')).toBe(true); // Laura via Nancy
    // Frank and Nancy are both children of the Marsh grandparents.
    const frankParents = new Set(graph.parentsOf('unc1').map((p) => p.id));
    const nancyParents = new Set(graph.parentsOf('aunt').map((p) => p.id));
    expect(frankParents.has('mgf')).toBe(true);
    expect(frankParents.has('mgm')).toBe(true);
    expect(nancyParents.has('mgf')).toBe(true);
    expect(nancyParents.has('mgm')).toBe(true);
  });

  it("the egg-donation child inherits from the donor, not her at-risk social mother, so she escapes the family's conditions", () => {
    const { graph, statusOf } = engine;
    // Chloe's genetic parents are Paul (sperm) and the egg donor Ivy — NOT her
    // gestational/social mother Margaret (whose social edge is non-genetic).
    const chloeParents = new Set(graph.parentsOf('eggchild').map((p) => p.id));
    expect(chloeParents.has('mhusb')).toBe(true); // Paul (biological)
    expect(chloeParents.has('donor')).toBe(true); // Ivy (donor egg)
    expect(chloeParents.has('maunt2')).toBe(false); // Margaret (social only)
    // Margaret is at risk down the maternal line, but Chloe is not.
    const mito = statusOf('hasMitochondrialMyopathy', 'mitochondrial');
    expect(mito('maunt2')).toBe('atRiskAffected'); // Margaret
    expect(mito('eggchild')).toBe('unknown'); // Chloe escapes it
    const hd = statusOf('hasHuntingtons', 'autosomalDominant');
    expect(hd('eggchild')).toBe('unknown'); // and Huntington's too
  });
});
