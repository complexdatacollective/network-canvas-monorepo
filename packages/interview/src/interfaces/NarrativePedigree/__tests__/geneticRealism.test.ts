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

// Guards that the comprehensive example is GENETICALLY COHERENT and EGO-CENTRIC:
// every condition reaches ego, her partner or her children; each branch computes
// the pattern the fixture docstring promises; the six patterns COLLECTIVELY
// surface every notation symbol (including the two the plain view previously
// never reached — "will develop it" (obligateAffected) and the "two copies"
// homozygous marker); and mitochondrial DONATION lets the aunt's child escape
// the mtDNA condition while still inheriting her nuclear genome. Runs the real
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

describe('comprehensive example — every symbol, every pattern, ego-centric', () => {
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
    for (const status of [
      'affected',
      'obligateAffected',
      'obligateCarrier',
      'atRiskAffected',
      'atRiskCarrier',
    ] as const) {
      expect(seen.has(status), `status ${status} should appear`).toBe(true);
    }
    expect(seenHomozygous).toBe(true);
  });

  it("Huntington's (autosomal dominant) sweeps the maternal line to ego's children", () => {
    const status = engine.statusOf('hasHuntingtons', 'autosomalDominant');
    expect(status('mgf')).toBe('affected'); // George Bauer
    expect(status('mother')).toBe('affected'); // Rose
    expect(status('ego')).toBe('atRiskAffected');
    expect(status('son')).toBe('atRiskAffected'); // Noah
    expect(status('daughter')).toBe('atRiskAffected'); // Ava
    // The paternal line and married-in partner carry no HD allele.
    expect(status('father')).toBe('unknown'); // David (Frank's line)
    expect(status('partner')).toBe('unknown'); // Chris
  });

  it("cystic fibrosis: ego's parents are first cousins, so ego is at-risk-homozygous", () => {
    const { statusOf, homozygousFor } = engine;
    const status = statusOf('hasCysticFibrosis', 'autosomalRecessive');
    expect(status('sib')).toBe('affected'); // Sam (autozygous)
    expect(status('mother')).toBe('obligateCarrier'); // Rose
    expect(status('father')).toBe('obligateCarrier'); // David
    expect(status('ego')).toBe('atRiskAffected');
    // Ego carries the "two copies" homozygous risk (consanguineous parents).
    const homozygous = homozygousFor('hasCysticFibrosis', 'autosomalRecessive');
    expect(homozygous.get('ego')).toBe(true);
  });

  it("haemophilia (X-linked recessive): two affected uncles make Nancy an obligate carrier; the line reaches ego's son", () => {
    const status = engine.statusOf('hasHaemophilia', 'xLinkedRecessive');
    expect(status('muncle')).toBe('affected'); // Thomas
    expect(status('muncle2')).toBe('affected'); // Robert
    expect(status('mgm')).toBe('obligateCarrier'); // Nancy (2 affected sons)
    expect(status('mother')).toBe('atRiskCarrier'); // Rose
    expect(status('ego')).toBe('atRiskCarrier');
    expect(status('daughter')).toBe('atRiskCarrier'); // Ava
    expect(status('son')).toBe('atRiskAffected'); // Noah (son of a carrier)
  });

  it("X-linked dominant: ego's affected father makes ego 'will develop it', and she transmits to both children", () => {
    const status = engine.statusOf('hasHypophosphataemia', 'xLinkedDominant');
    expect(status('father')).toBe('affected'); // David
    // An affected father passes his X to every daughter → ego will develop it.
    expect(status('ego')).toBe('obligateAffected');
    // A female transmitter reaches sons as well as daughters.
    expect(status('son')).toBe('atRiskAffected'); // Noah
    expect(status('daughter')).toBe('atRiskAffected'); // Ava
  });

  it("Y-linked descends the partner's Adler male line and infers ego's son 'will develop it'", () => {
    const status = engine.statusOf('hasYLinkedHearingLoss', 'yLinked');
    expect(status('pf')).toBe('affected'); // Walter Adler
    expect(status('partner')).toBe('affected'); // Chris
    expect(status('son')).toBe('obligateAffected'); // Noah — will develop it
    // Ego (female) and her daughter are never on the Y line.
    expect(status('ego')).toBe('unknown');
    expect(status('daughter')).toBe('unknown'); // Ava
  });

  it('mitochondrial: matrilineal to ego and her children; a male does not transmit', () => {
    const status = engine.statusOf('hasMitochondrialMyopathy', 'mitochondrial');
    expect(status('ggm')).toBe('affected'); // Eleanor
    expect(status('mother')).toBe('atRiskAffected'); // Rose
    expect(status('ego')).toBe('atRiskAffected');
    expect(status('son')).toBe('atRiskAffected'); // Noah
    expect(status('daughter')).toBe('atRiskAffected'); // Ava
    // An at-risk MALE (Frank) carries the mtDNA but does not pass it to his
    // child, so ego's father (David, Frank's son) is off the mtDNA line.
    expect(status('pgf')).toBe('atRiskAffected'); // Frank
    expect(status('father')).toBe('unknown'); // David
  });

  it('the consanguineous CF union is wired: ego is the child of two first cousins who share the Marsh great-grandparents', () => {
    const { graph } = engine;
    const motherParents = new Set(graph.parentsOf('mother').map((p) => p.id));
    const fatherParents = new Set(graph.parentsOf('father').map((p) => p.id));
    expect(motherParents.has('mgm')).toBe(true); // Rose via Nancy
    expect(fatherParents.has('pgf')).toBe(true); // David via Frank
    // Nancy and Frank are both children of the Marsh great-grandparents.
    const nancyParents = new Set(graph.parentsOf('mgm').map((p) => p.id));
    const frankParents = new Set(graph.parentsOf('pgf').map((p) => p.id));
    expect(nancyParents.has('ggf')).toBe(true);
    expect(nancyParents.has('ggm')).toBe(true);
    expect(frankParents.has('ggf')).toBe(true);
    expect(frankParents.has('ggm')).toBe(true);
  });

  it("mitochondrial donation: the aunt's child inherits mtDNA from the donor, not her at-risk mother, so she escapes the mito condition but keeps the mother's autosomes", () => {
    const { graph, statusOf } = engine;
    // Chloe's mtDNA comes from the donor egg (Ivy), NOT from her intended
    // mother Margaret; her nuclear parents are Margaret + Paul, not the donor.
    expect(graph.mitochondrialParentsOf('mrtchild')).toEqual(['donor']);
    const nuclearParents = new Set(
      graph.parentsOf('mrtchild').map((p) => p.id),
    );
    expect(nuclearParents.has('maunt')).toBe(true); // Margaret (nucleus)
    expect(nuclearParents.has('mhusb')).toBe(true); // Paul (sperm)
    expect(nuclearParents.has('donor')).toBe(false); // Ivy is mtDNA-only

    // Margaret is at risk down the maternal line, but Chloe escapes it...
    const mito = statusOf('hasMitochondrialMyopathy', 'mitochondrial');
    expect(mito('maunt')).toBe('atRiskAffected'); // Margaret
    expect(mito('mrtchild')).toBe('unknown'); // Chloe escapes the mito condition
    // ...while still inheriting Margaret's nuclear (autosomal) Huntington's risk.
    const hd = statusOf('hasHuntingtons', 'autosomalDominant');
    expect(hd('maunt')).toBe('atRiskAffected'); // Margaret
    expect(hd('mrtchild')).toBe('atRiskAffected'); // Chloe stays at risk for HD
  });
});
