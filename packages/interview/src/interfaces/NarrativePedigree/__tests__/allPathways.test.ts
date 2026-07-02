import { describe, expect, it } from 'vitest';

import type { InheritancePattern } from '@codaco/shared-consts';

import {
  computeAtRiskHomozygous,
  computeStatuses,
} from '../genetics/computeStatuses';
import { buildGeneticGraph } from '../genetics/geneticGraph';
import { resolveSex } from '../genetics/resolveSex';
import { affectedSet, type Status } from '../genetics/status';
import { buildAllPathwaysInterview } from '../NarrativePedigree.pathways.stories';

// Guards the comprehensive example: every inheritance pattern is coherent, the
// pattern set COLLECTIVELY surfaces every Sticker status (including the
// otherwise-hard-to-reach `obligateAffected` — "will develop it"), and the
// consanguineous cousin union is wired. Runs the real engine on the fixture.

const CFG = {
  biologicalSexVariable: 'biologicalSex',
  gameteRoleVariable: 'gameteRole',
  relationshipTypeVariable: 'relType',
};

const CONDITIONS: {
  variable: string;
  pattern: InheritancePattern;
}[] = [
  { variable: 'hasHuntingtons', pattern: 'autosomalDominant' },
  { variable: 'hasCysticFibrosis', pattern: 'autosomalRecessive' },
  { variable: 'hasHaemophilia', pattern: 'xLinkedRecessive' },
  { variable: 'hasHypophosphataemia', pattern: 'xLinkedDominant' },
  { variable: 'hasYLinkedHearingLoss', pattern: 'yLinked' },
  { variable: 'hasMitochondrialMyopathy', pattern: 'mitochondrial' },
];

function engine() {
  const { nodes, edges } = buildAllPathwaysInterview(7).getNetwork();
  const resolveSexFn = (id: string) => resolveSex(id, nodes, edges, CFG);
  const graph = buildGeneticGraph(
    nodes,
    edges,
    { relationshipTypeVariable: 'relType' },
    resolveSexFn,
  );
  const statusesFor = (variable: string, pattern: InheritancePattern) =>
    computeStatuses(graph, affectedSet(nodes, variable), pattern, resolveSexFn);
  return { nodes, edges, graph, resolveSexFn, statusesFor };
}

describe('all-pathways example is comprehensive and coherent', () => {
  it('surfaces every Sticker status across the six conditions', () => {
    const { statusesFor } = engine();
    const seen = new Set<Status>();
    for (const c of CONDITIONS) {
      for (const s of statusesFor(c.variable, c.pattern).values()) {
        seen.add(s);
      }
    }
    for (const status of [
      'affected',
      'obligateAffected',
      'obligateCarrier',
      'atRiskAffected',
      'atRiskCarrier',
    ] as const) {
      expect(seen.has(status)).toBe(true);
    }
  });

  it('X-linked dominant makes ego OBLIGATE-AFFECTED ("will develop it")', () => {
    const { statusesFor } = engine();
    const xld = statusesFor('hasHypophosphataemia', 'xLinkedDominant');
    expect(xld.get('father')).toBe('affected'); // David, the affected male
    expect(xld.get('ego')).toBe('obligateAffected'); // his daughter — will develop it
    expect(xld.get('son')).toBe('atRiskAffected'); // ego transmits onward
    expect(xld.get('daughter')).toBe('atRiskAffected');
  });

  it("Y-linked descends the paternal male line to ego's son", () => {
    const { statusesFor } = engine();
    const y = statusesFor('hasYLinkedHearingLoss', 'yLinked');
    expect(y.get('gf-pat')).toBe('affected'); // Harold, the affected founder
    expect(y.get('son')).toBe('obligateAffected'); // Leo, will develop it
    // A female is never on the Y line.
    expect(y.get('ego') ?? 'unknown').toBe('unknown');
  });

  it("autosomal dominant reaches ego and her children; the cousin-partner's side carries no HD", () => {
    const { statusesFor } = engine();
    const hd = statusesFor('hasHuntingtons', 'autosomalDominant');
    expect(hd.get('ego')).toBe('atRiskAffected');
    expect(hd.get('son')).toBe('atRiskAffected');
    expect(hd.get('daughter')).toBe('atRiskAffected');
    expect(hd.get('partner') ?? 'unknown').toBe('unknown'); // Chris is on the paternal side
  });

  it('the recessive cousin union makes the children autozygous (homozygous-risk)', () => {
    const { graph, statusesFor, resolveSexFn } = engine();
    const cf = statusesFor('hasCysticFibrosis', 'autosomalRecessive');
    expect(cf.get('daughter')).toBe('affected'); // Mia
    expect(cf.get('ego')).toBe('obligateCarrier');
    expect(cf.get('partner')).toBe('obligateCarrier'); // Chris, ego's first cousin
    const homozygous = computeAtRiskHomozygous(
      graph,
      cf,
      'autosomalRecessive',
      resolveSexFn,
    );
    expect(homozygous.get('son')).toBe(true); // Leo, at-risk homozygous
  });

  it('wires the consanguineous union: the partner is ego’s paternal first cousin', () => {
    const { graph } = engine();
    // Chris (partner) and ego are both grandchildren of the paternal grandparents.
    const chrisParents = new Set(graph.parentsOf('partner').map((p) => p.id));
    const egoParents = new Set(graph.parentsOf('ego').map((p) => p.id));
    expect(chrisParents.has('uncle-pat')).toBe(true); // Martin (David's brother)
    expect(egoParents.has('father')).toBe(true); // David
    // Martin and David share the paternal grandparents → ego and Chris are cousins.
    const martinParents = new Set(
      graph.parentsOf('uncle-pat').map((p) => p.id),
    );
    const davidParents = new Set(graph.parentsOf('father').map((p) => p.id));
    expect(martinParents.has('gf-pat')).toBe(true);
    expect(davidParents.has('gf-pat')).toBe(true);
  });
});
