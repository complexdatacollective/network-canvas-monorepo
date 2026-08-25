import { describe, expect, it } from 'vitest';

import type { InheritancePattern } from '@codaco/protocol-validation';

import { ValueGenerator } from '../../../ValueGenerator';
import {
  attainableFamilyPedigreeNodeCeiling,
  generateFamilyPedigreePlan,
  sampleFamilyPedigreeScenario,
} from '../generateFamilyPedigree';
import {
  resolveFamilyPedigreeGenerationOptions,
  US_FAMILY_PEDIGREE_POPULATION,
} from '../referencePopulation';
import type {
  FamilyPedigreePlan,
  FamilyPedigreeScenario,
  PedigreeDisease,
} from '../types';

function plan(
  seed: number,
  scenario: FamilyPedigreeScenario = 'none',
  diseases: readonly PedigreeDisease[] = [],
  maxNodes = 100,
): FamilyPedigreePlan {
  return generateFamilyPedigreePlan(
    new ValueGenerator(seed, '2026-08-04'),
    resolveFamilyPedigreeGenerationOptions({ scenario, maxNodes }, maxNodes),
    diseases,
    false,
  );
}

function relationshipCounts(subject: FamilyPedigreePlan) {
  const counts = new Map<string, number>();
  for (const person of subject.people) {
    if (person.relationshipToEgo === undefined) continue;
    counts.set(
      person.relationshipToEgo,
      (counts.get(person.relationshipToEgo) ?? 0) + 1,
    );
  }
  return counts;
}

describe('generateFamilyPedigreePlan', () => {
  it('builds a complete, internally consistent multi-generational family', () => {
    const scenarios: FamilyPedigreeScenario[] = [
      'none',
      'adoption',
      'donorConception',
      'surrogacy',
    ];
    for (const scenario of scenarios) {
      for (let seed = 1; seed <= 100; seed++) {
        const subject = plan(seed, scenario);
        const keys = new Set(subject.people.map((person) => person.key));
        expect(keys.size).toBe(subject.people.length);
        expect(subject.people[0]?.key).toBe('ego');
        expect(subject.people.length).toBeGreaterThanOrEqual(7);

        const egoParents = subject.relationships.filter(
          (edge) =>
            edge.to === subject.egoKey &&
            (edge.relationshipType === 'biological' ||
              edge.relationshipType === 'donor'),
        );
        expect(egoParents).toHaveLength(2);

        for (const edge of subject.relationships) {
          expect(keys.has(edge.from)).toBe(true);
          expect(keys.has(edge.to)).toBe(true);
          if (
            edge.relationshipType === 'biological' ||
            edge.relationshipType === 'donor'
          ) {
            expect(edge.isActive).toBe(true);
            expect(['egg', 'sperm']).toContain(edge.gameteRole);
          }
          if (edge.relationshipType === 'surrogate') {
            expect(edge.isGestationalCarrier).toBe(true);
            expect(edge.gameteRole).toBeUndefined();
          }
        }

        // Mirrors the interface's required-grandparents boundary: every
        // genetic parent of ego, including a donor, has two genetic parents.
        for (const parent of egoParents) {
          const grandparents = subject.relationships.filter(
            (edge) =>
              edge.to === parent.from &&
              (edge.relationshipType === 'biological' ||
                edge.relationshipType === 'donor'),
          );
          expect(grandparents).toHaveLength(2);
        }
      }
    }
  });

  it('honours the optional-branch cap and required contributor boundary', () => {
    const compact = plan(4, 'none', [], 7);
    expect(compact.people).toHaveLength(7);
    expect(compact.hasEgoChildren).toBe(false);

    for (let seed = 1; seed <= 100; seed++) {
      const subject = generateFamilyPedigreePlan(
        new ValueGenerator(seed, '2026-08-04'),
        resolveFamilyPedigreeGenerationOptions(
          { scenario: 'none', maxNodes: 32 },
          32,
        ),
        [],
        true,
      );
      expect(subject.people.length).toBeLessThanOrEqual(32);
      if (!subject.hasEgoChildren) continue;

      const keys = new Set(subject.people.map((person) => person.key));
      for (const key of [
        'partner-mother',
        'partner-father',
        'partner-maternal-grandmother',
        'partner-maternal-grandfather',
        'partner-paternal-grandmother',
        'partner-paternal-grandfather',
      ]) {
        expect(keys.has(key), `seed ${seed}: ${key}`).toBe(true);
      }
    }
  });

  it('bounds every plan by the population-attainable node ceiling', () => {
    const childlessPopulation = {
      ...US_FAMILY_PEDIGREE_POPULATION,
      completedFamilySize: [{ value: 0, weight: 1 }],
      childlessPartnerProbability: 1,
      scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
    };
    const profiles = [US_FAMILY_PEDIGREE_POPULATION, childlessPopulation];
    const scenarios: FamilyPedigreeScenario[] = [
      'population',
      'none',
      'adoption',
      'donorConception',
      'surrogacy',
    ];

    for (const population of profiles) {
      for (const scenario of scenarios) {
        for (const maxNodes of [7, 8, 9, 12, 32]) {
          for (const requireContributors of [false, true]) {
            const options = resolveFamilyPedigreeGenerationOptions(
              { population, scenario, maxNodes },
              maxNodes,
            );
            const ceiling = attainableFamilyPedigreeNodeCeiling(
              options,
              true,
              requireContributors,
            );

            for (let seed = 1; seed <= 20; seed++) {
              const subject = generateFamilyPedigreePlan(
                new ValueGenerator(seed, '2026-08-05'),
                options,
                [
                  {
                    variable: 'condition',
                    inheritancePattern: 'xLinkedRecessive',
                  },
                ],
                requireContributors,
                'female',
              );
              expect(subject.people.length).toBeLessThanOrEqual(ceiling);
            }
          }
        }
      }
    }

    const childlessOptions = resolveFamilyPedigreeGenerationOptions(
      {
        population: childlessPopulation,
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 9,
      },
      9,
    );
    expect(
      attainableFamilyPedigreeNodeCeiling(childlessOptions, false, false),
    ).toBe(8);
  });

  it('evaluates child branches at every supported sibling count', () => {
    const population = {
      ...US_FAMILY_PEDIGREE_POPULATION,
      completedFamilySize: [
        { value: 1, weight: 1 },
        { value: 2, weight: 1 },
      ],
      femaleAtBirthProbability: 0,
      childlessPartnerProbability: 0,
      scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
    };
    const options = resolveFamilyPedigreeGenerationOptions(
      { population, scenario: 'none', diseaseMode: 'none', maxNodes: 15 },
      15,
    );
    const subject = generateFamilyPedigreePlan(
      new ValueGenerator(11, '2026-08-05'),
      options,
      [],
      true,
      'male',
    );

    expect(
      subject.people.filter((person) => person.relationshipToEgo === 'Sibling'),
    ).toHaveLength(0);
    expect(
      subject.people.filter((person) => person.relationshipToEgo === 'Child'),
    ).toHaveLength(1);
    expect(subject.people).toHaveLength(15);
    expect(attainableFamilyPedigreeNodeCeiling(options, false, true)).toBe(15);
  });

  it.each([
    ['adoption', 'adoptive', 2],
    ['donorConception', 'donor', 1],
    ['surrogacy', 'surrogate', 1],
  ] as const)(
    'forces a coherent %s scenario',
    (scenario, relationshipType, minimumEdges) => {
      const subject = plan(11, scenario);
      expect(subject.scenario).toBe(scenario);
      const scenarioEdges = subject.relationships.filter(
        (edge) => edge.relationshipType === relationshipType,
      );
      expect(scenarioEdges.length).toBeGreaterThanOrEqual(minimumEdges);

      if (scenario === 'donorConception') {
        expect(
          subject.relationships.some(
            (edge) =>
              edge.to === subject.egoKey && edge.relationshipType === 'social',
          ),
        ).toBe(true);
        const donor = subject.people.find(
          (person) => person.relationshipToEgo === 'Donor',
        );
        expect(donor).toBeDefined();
        expect(
          subject.relationships.filter(
            (edge) =>
              edge.to === donor?.key && edge.relationshipType === 'biological',
          ),
        ).toHaveLength(2);
      }
      if (scenario === 'surrogacy') {
        expect(scenarioEdges.every((edge) => edge.isGestationalCarrier)).toBe(
          true,
        );
      }
    },
  );

  it('plants visible, inheritance-pattern-aware disease lineages', () => {
    const patterns: InheritancePattern[] = [
      'autosomalDominant',
      'autosomalRecessive',
      'xLinkedDominant',
      'xLinkedRecessive',
      'yLinked',
      'mitochondrial',
      'multifactorial',
      'unknown',
    ];
    const diseases = patterns.map((inheritancePattern) => ({
      variable: inheritancePattern,
      inheritancePattern,
    }));

    for (let seed = 1; seed <= 20; seed++) {
      const subject = plan(seed, 'none', diseases);
      for (const disease of diseases) {
        const affected = subject.people.filter((person) =>
          person.affectedVariables.has(disease.variable),
        );
        expect(affected.length, disease.variable).toBeGreaterThanOrEqual(2);
        expect(
          new Set(affected.map((person) => person.generation)).size,
          disease.variable,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('keeps sex-linked disease on the donor lineage, not the social parent lineage', () => {
    const diseases: PedigreeDisease[] = [
      { variable: 'xld', inheritancePattern: 'xLinkedDominant' },
      { variable: 'y', inheritancePattern: 'yLinked' },
    ];

    for (let seed = 1; seed <= 50; seed++) {
      const subject = plan(seed, 'donorConception', diseases);
      const donor = subject.people.find(
        (person) => person.relationshipToEgo === 'Donor',
      );
      expect(donor?.affectedVariables.has('xld')).toBe(true);
      expect(donor?.affectedVariables.has('y')).toBe(true);

      const socialSiblings = subject.people.filter((person) =>
        person.key.startsWith('sibling-'),
      );
      expect(
        socialSiblings.every(
          (person) =>
            !person.affectedVariables.has('xld') &&
            !person.affectedVariables.has('y'),
        ),
      ).toBe(true);
    }
  });

  it('reproduces the reference population at aggregate scale', () => {
    const samples = 5_000;
    let siblings = 0;
    let auntsUncles = 0;
    let cousins = 0;

    for (let seed = 1; seed <= samples; seed++) {
      const counts = relationshipCounts(plan(seed));
      siblings += counts.get('Sibling') ?? 0;
      auntsUncles += counts.get('Aunt/Uncle') ?? 0;
      cousins += counts.get('Cousin') ?? 0;
    }

    expect(siblings / samples).toBeGreaterThan(1.4);
    expect(siblings / samples).toBeLessThan(2.1);
    expect(auntsUncles / samples).toBeGreaterThan(2.8);
    expect(auntsUncles / samples).toBeLessThan(4.2);
    expect(cousins / samples).toBeGreaterThan(4.5);
    expect(cousins / samples).toBeLessThan(8.5);
  });

  it('samples rare reproductive scenarios at the configured population rates', () => {
    const samples = 25_000;
    const valueGen = new ValueGenerator(104, '2026-08-04');
    const options = resolveFamilyPedigreeGenerationOptions(
      { scenario: 'population', maxNodes: 100 },
      100,
    );
    const observed = new Map<string, number>();
    for (let sample = 0; sample < samples; sample++) {
      const scenario = sampleFamilyPedigreeScenario(valueGen, options);
      observed.set(scenario, (observed.get(scenario) ?? 0) + 1);
    }

    const rate = (scenario: string) => (observed.get(scenario) ?? 0) / samples;
    expect(rate('adoption')).toBeGreaterThan(0.024);
    expect(rate('adoption')).toBeLessThan(0.036);
    expect(rate('donorConception')).toBeGreaterThan(0.002);
    expect(rate('donorConception')).toBeLessThan(0.008);
    expect(rate('surrogacy')).toBeGreaterThan(0.0002);
    expect(rate('surrogacy')).toBeLessThan(0.002);
  });

  it('keeps the bundled profile transparent and source-backed', () => {
    expect(US_FAMILY_PEDIGREE_POPULATION.sources).toHaveLength(5);
    expect(US_FAMILY_PEDIGREE_POPULATION.sources).toContain(
      'https://www.childwelfare.gov/pubPDFs/adopted2010_19.pdf',
    );
    expect(
      US_FAMILY_PEDIGREE_POPULATION.completedFamilySize.reduce(
        (sum, entry) => sum + entry.weight,
        0,
      ),
    ).toBeCloseTo(1, 2);
  });
});
