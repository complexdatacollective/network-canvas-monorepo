import { describe, expect, it } from 'vitest';

import type { InheritancePattern } from '@codaco/shared-consts';

import {
  computeAtRiskHomozygous,
  computeStatuses,
} from '../genetics/computeStatuses';
import { buildGeneticGraph } from '../genetics/geneticGraph';
import { resolveSex } from '../genetics/resolveSex';
import { affectedSet, type Status } from '../genetics/status';
import { buildPedigreeInterview } from '../NarrativePedigree.stories';

// Guards that the example pedigree is GENETICALLY COHERENT for every condition:
// each affected person has the carrier/affected source in their own ancestry,
// and the scenarios the docstring promises (a dominant line reaching ego's
// children; carrier×carrier → affected child; carrier-mother → affected-son)
// actually compute. Runs the real engine on the seeded fixture.

const CFG = {
  biologicalSexVariable: 'biologicalSex',
  gameteRoleVariable: 'gameteRole',
  relationshipTypeVariable: 'relType',
};

function statusesFor(variable: string, pattern: InheritancePattern) {
  const { nodes, edges } = buildPedigreeInterview(1).getNetwork();
  const resolveSexFn = (id: string) => resolveSex(id, nodes, edges, CFG);
  const graph = buildGeneticGraph(
    nodes,
    edges,
    { relationshipTypeVariable: 'relType' },
    resolveSexFn,
  );
  const statuses = computeStatuses(
    graph,
    affectedSet(nodes, variable),
    pattern,
    resolveSexFn,
  );
  const homozygous = computeAtRiskHomozygous(
    graph,
    statuses,
    pattern,
    resolveSexFn,
  );
  return {
    status: (uid: string): Status => statuses.get(uid) ?? 'unknown',
    homozygous: (uid: string): boolean => homozygous.get(uid) ?? false,
  };
}

describe('example pedigree is genetically coherent', () => {
  it("Huntington's (autosomal dominant) descends a manifested line to ego's children", () => {
    const { status } = statusesFor('hasHuntingtons', 'autosomalDominant');
    // Two generations manifested on the maternal line.
    expect(status('gf')).toBe('affected'); // Arthur
    expect(status('mother')).toBe('affected'); // Rose
    // The allele reaches ego and BOTH of ego's children.
    expect(status('ego')).toBe('atRiskAffected');
    expect(status('son')).toBe('atRiskAffected');
    expect(status('daughter')).toBe('atRiskAffected');
    // The paternal/partner sides carry no HD allele.
    expect(status('father')).toBe('unknown');
    expect(status('partner')).toBe('unknown');
    expect(status('cf')).toBe('unknown'); // George
  });

  it('Haemophilia (X-linked recessive) runs carrier-mother → affected-son to ego’s son', () => {
    const { status, homozygous } = statusesFor(
      'hasHaemophilia',
      'xLinkedRecessive',
    );
    expect(status('father')).toBe('affected'); // David
    expect(status('son')).toBe('affected'); // Leo
    // David's affected X makes his daughter ego an OBLIGATE carrier...
    expect(status('ego')).toBe('obligateCarrier');
    // ...whose carrier source traces up to David's mother Irene.
    expect(status('gm-pat')).toBe('atRiskCarrier'); // Irene
    // ego's daughter inherits the carrier risk.
    expect(status('daughter')).toBe('atRiskCarrier'); // Mia
    // ego is a known het carrier; the homozygous prior still flags via the
    // affected-father + carrier-mother rule (clinician-mode signal only).
    expect(homozygous('ego')).toBe(true);
  });

  it('Cystic fibrosis (autosomal recessive): two unaffected carrier parents → affected child', () => {
    const { status, homozygous } = statusesFor(
      'hasCysticFibrosis',
      'autosomalRecessive',
    );
    expect(status('daughter')).toBe('affected'); // Mia
    // BOTH of Mia's parents are unaffected obligate carriers — her two copies
    // come one from each.
    expect(status('ego')).toBe('obligateCarrier');
    expect(status('partner')).toBe('obligateCarrier'); // Chris
    // Her sibling Leo is at risk of being affected (and homozygous).
    expect(status('son')).toBe('atRiskAffected'); // Leo
    expect(homozygous('son')).toBe(true);
    // The carrier alleles trace up to a grandparent on each side.
    expect(status('mother')).toBe('atRiskCarrier'); // Rose (ego's side)
    expect(status('cf')).toBe('atRiskCarrier'); // George (Chris's side)
  });

  it("Mitochondrial myopathy runs the maternal line down to ego's children", () => {
    const { status } = statusesFor('hasMitochondrialMyopathy', 'mitochondrial');
    expect(status('gm')).toBe('affected'); // Eleanor
    expect(status('mother')).toBe('atRiskAffected'); // Rose
    expect(status('ego')).toBe('atRiskAffected');
    expect(status('son')).toBe('atRiskAffected');
    expect(status('daughter')).toBe('atRiskAffected');
    // mtDNA is maternal only — the male partner line carries nothing.
    expect(status('father')).toBe('unknown'); // David
    expect(status('partner')).toBe('unknown'); // Chris
  });
});
