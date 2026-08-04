import { describe, expect, it } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  validatePedigreeStructure,
} from '@codaco/shared-consts';

import type { Rng } from '../demography.ts';
import { generatePedigree } from '../generatePedigree.ts';
import type { PedigreeVariableConfig } from '../render.ts';

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

const CONFIG: PedigreeVariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationshipToEgo',
  biologicalSexVariable: 'biologicalSex',
  relationshipTypeVariable: 'relationshipType',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGestationalCarrier',
  gameteRoleVariable: 'gameteRole',
};

type Severity = 'required' | 'recommended' | 'off';

function generate(
  seed: number,
  options: {
    mode?: 'showcase' | 'populationRates';
    pattern?: string;
    boundaries?: {
      requireGrandparents: Severity;
      requireChildrenContributors: Severity;
    };
  } = {},
) {
  let counter = 0;
  return generatePedigree({
    rng: makeRng(seed),
    mode: options.mode ?? 'showcase',
    boundaries: options.boundaries,
    config: CONFIG,
    nominations: [
      {
        variable: 'hasCondition',
        inheritancePattern: (options.pattern ??
          'autosomalDominant') as 'autosomalDominant',
      },
    ],
    nextId: () => `id-${(counter += 1)}`,
    nextName: () => `Person ${counter}`,
    stageId: 'family-pedigree',
  });
}

function asStructureInput(result: ReturnType<typeof generate>) {
  return {
    nodes: result.nodes.map((node) => ({
      id: node[entityPrimaryKeyProperty],
      attributes: node[entityAttributesProperty],
    })),
    edges: result.edges.map((edge) => ({
      id: edge[entityPrimaryKeyProperty],
      from: edge.from,
      to: edge.to,
      attributes: edge[entityAttributesProperty],
    })),
    config: CONFIG,
  };
}

describe('generatePedigree', () => {
  // The acceptance criterion for the whole redesign: every generated pedigree
  // satisfies the structural invariants the interview runtime enforces. The
  // previous generator failed all of these on every seed.
  it('satisfies every structural invariant, on every seed, in both modes', () => {
    for (const mode of ['showcase', 'populationRates'] as const) {
      for (let seed = 1; seed <= 250; seed++) {
        const issues = validatePedigreeStructure(
          asStructureInput(generate(seed, { mode })),
        );
        expect(
          issues.map((issue) => `${issue.code}: ${issue.message}`),
          `${mode} seed ${seed}`,
        ).toEqual([]);
      }
    }
  });

  it('satisfies the invariants under every inheritance pattern', () => {
    const patterns = [
      'autosomalDominant',
      'autosomalRecessive',
      'xLinkedDominant',
      'xLinkedRecessive',
      'yLinked',
      'mitochondrial',
      'multifactorial',
      'unknown',
    ];
    for (const pattern of patterns) {
      for (let seed = 1; seed <= 40; seed++) {
        const issues = validatePedigreeStructure(
          asStructureInput(generate(seed, { pattern })),
        );
        expect(issues, `${pattern} seed ${seed}`).toEqual([]);
      }
    }
  });

  it('commits a membership list covering every person it created', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const result = generate(seed);
      expect(result.metadata.isNetworkCommitted).toBe(true);
      expect(result.metadata.nodes).toHaveLength(result.nodes.length);
      expect(result.metadata.edges).toHaveLength(result.edges.length);
      expect(result.metadata.nodes.filter((entry) => entry.isEgo)).toHaveLength(
        1,
      );

      const nodeIds = new Set(
        result.nodes.map((node) => node[entityPrimaryKeyProperty]),
      );
      for (const entry of result.metadata.nodes) {
        expect(nodeIds.has(entry.id)).toBe(true);
      }
    }
  });

  it('writes partner edges, which the previous generator never produced', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const result = generate(seed);
      const partners = result.edges.filter(
        (edge) =>
          JSON.stringify(edge[entityAttributesProperty].relationshipType) ===
          '["partner"]',
      );
      expect(partners.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('writes a gamete role on every genetic parentage edge', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const result = generate(seed);
      const genetic = result.edges.filter((edge) => {
        const type = JSON.stringify(
          edge[entityAttributesProperty].relationshipType,
        );
        return type === '["biological"]' || type === '["donor"]';
      });
      expect(genetic.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const edge of genetic) {
        expect(
          edge[entityAttributesProperty].gameteRole,
          `seed ${seed}, edge ${edge[entityPrimaryKeyProperty]}`,
        ).toBeDefined();
      }
    }
  });

  it('marks a condition along a descent path rather than at random', () => {
    // Under dominance every affected person bar the founder has an affected
    // genetic parent, so the count of affected people who do not is zero. A
    // generator flipping the boolean independently would fail this immediately.
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const result = generate(seed);
      const affectedIds = new Set(
        result.nodes
          .filter(
            (node) => node[entityAttributesProperty].hasCondition === true,
          )
          .map((node) => node[entityPrimaryKeyProperty]),
      );
      if (affectedIds.size === 0) continue;
      checked += 1;

      const geneticParentsOf = new Map<string, string[]>();
      for (const edge of result.edges) {
        const attrs = edge[entityAttributesProperty];
        const type = JSON.stringify(attrs.relationshipType);
        if (type !== '["biological"]' && type !== '["donor"]') continue;
        geneticParentsOf.set(edge.to, [
          ...(geneticParentsOf.get(edge.to) ?? []),
          edge.from,
        ]);
      }

      const orphanAffected = [...affectedIds].filter((id) => {
        const parents = geneticParentsOf.get(id) ?? [];
        return parents.length > 0 && !parents.some((p) => affectedIds.has(p));
      });
      expect(orphanAffected, `seed ${seed}`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(0);
  });

  // The stage decides how complete a pedigree has to be. Generating a deeper
  // one than it asked for hides the shallow cases the interface supports; a
  // shallower one produces a pedigree the interface would refuse to finalize.
  it('satisfies whatever boundaries the stage configures', () => {
    const severities: Severity[] = ['off', 'recommended', 'required'];
    for (const requireGrandparents of severities) {
      for (const requireChildrenContributors of severities) {
        const boundaries = { requireGrandparents, requireChildrenContributors };
        for (let seed = 1; seed <= 60; seed++) {
          const result = generate(seed, { boundaries });
          const issues = validatePedigreeStructure({
            ...asStructureInput(result),
            boundaries,
            noChildrenAffirmed: result.metadata.noChildrenAffirmed,
          });
          expect(
            issues.map((issue) => `${issue.code}: ${issue.message}`),
            `${requireGrandparents}/${requireChildrenContributors} seed ${seed}`,
          ).toEqual([]);
        }
      }
    }
  });

  // A pedigree does not have to reach the grandparents. `requireGrandparents`
  // defaults to `off`, a donor's parents are essentially never known, and an
  // adoptee's genetic line is usually absent — so a generator that always drew
  // four grandparents could not produce the cases the interface exists for.
  it('produces pedigrees that stop short of the grandparents when nothing requires them', () => {
    let shallow = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const result = generate(seed, {
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
      });
      const egoId = result.structure.egoId;
      const genetic = (id: string) =>
        (result.structure.parents.get(id) ?? []).filter(
          (link) =>
            link.relationshipType === 'biological' ||
            link.relationshipType === 'donor',
        );
      const anyParentWithoutParents = genetic(egoId).some(
        (link) => genetic(link.parent).length === 0,
      );
      if (anyParentWithoutParents) shallow += 1;
    }
    expect(shallow).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = generate(seed);
      const b = generate(seed);
      expect(JSON.stringify(a.nodes)).toEqual(JSON.stringify(b.nodes));
      expect(JSON.stringify(a.edges)).toEqual(JSON.stringify(b.edges));
    }
  });
});
