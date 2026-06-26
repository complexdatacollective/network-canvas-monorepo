import { describe, expect, it } from 'vitest';

import type { NcEdge, NcNode } from '@codaco/shared-consts';
import type { VariableConfig } from '~/interfaces/FamilyPedigree/store';

import {
  evaluateBoundaries,
  geneticParentIds,
  validatePedigreeCompleteness,
} from '../validatePedigree';

const variableConfig: VariableConfig = {
  nodeType: 'person',
  edgeType: 'family',
  nodeLabelVariable: 'name',
  egoVariable: 'isEgo',
  relationshipVariable: 'relationship',
  relationshipTypeVariable: 'rel',
  isActiveVariable: 'isActive',
  isGestationalCarrierVariable: 'isGest',
  gameteRoleVariable: 'gameteRole',
  biologicalSexVariable: 'biologicalSex',
};

const OFF_BOUNDARIES = {
  requireGrandparents: 'off' as const,
  requireChildrenContributors: 'off' as const,
};

function makeNodes(
  entries: [string, { isEgo?: boolean; name?: string }][],
): Map<string, NcNode> {
  const map = new Map<string, NcNode>();
  for (const [id, { isEgo, name }] of entries) {
    map.set(id, {
      _uid: id,
      type: 'person',
      attributes: {
        [variableConfig.egoVariable]: isEgo ?? false,
        [variableConfig.nodeLabelVariable]: name ?? '',
      },
    });
  }
  return map;
}

function makeEdges(entries: [string, string, string][]): Map<string, NcEdge> {
  const map = new Map<string, NcEdge>();
  for (const [source, target, relType] of entries) {
    const id = `${source}->${target}`;
    map.set(id, {
      _uid: id,
      type: 'family',
      from: source,
      to: target,
      attributes: {
        [variableConfig.relationshipTypeVariable]: [relType],
        [variableConfig.isActiveVariable]: true,
      },
    });
  }
  return map;
}

describe('validatePedigreeCompleteness', () => {
  it('passes for ego with two parents and no grandparents (grandparents not required)', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);

    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'biological'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not require grandparents for an adopted ego with adoptive parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Adoptive Mum' }],
      ['dad', { name: 'Adoptive Dad' }],
    ]);

    const edges = makeEdges([
      ['mum', 'ego', 'adoptive'],
      ['dad', 'ego', 'adoptive'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues).toHaveLength(0);
  });

  it('flags ego missing parents', () => {
    const nodes = makeNodes([['ego', { isEgo: true }]]);
    const edges = makeEdges([]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('You');
  });

  it('flags ego with only one parent', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
    ]);
    const edges = makeEdges([['mum', 'ego', 'biological']]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues.some((i) => i.nodeId === 'ego')).toBe(true);
  });

  it('counts donor edges toward ego parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['donor', { name: 'Donor' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['donor', 'ego', 'donor'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not count social edges toward ego parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['step', { name: 'Step-dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['step', 'ego', 'social'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues.some((i) => i.nodeId === 'ego')).toBe(true);
  });

  it('does not count partner edges toward ego parents', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'partner'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      OFF_BOUNDARIES,
      false,
    );
    expect(issues.some((i) => i.nodeId === 'ego')).toBe(true);
  });

  it('includes required boundary issues in output', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'biological'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      { requireGrandparents: 'required', requireChildrenContributors: 'off' },
      false,
    );
    expect(issues.some((i) => i.severity === 'required')).toBe(true);
  });

  it('does not include recommended boundary issues in output', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'biological'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      {
        requireGrandparents: 'recommended',
        requireChildrenContributors: 'off',
      },
      false,
    );
    expect(issues).toHaveLength(0);
  });

  it('does not include off boundary issues in output', () => {
    const nodes = makeNodes([
      ['ego', { isEgo: true }],
      ['mum', { name: 'Mum' }],
      ['dad', { name: 'Dad' }],
    ]);
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'biological'],
    ]);

    const issues = validatePedigreeCompleteness(
      nodes,
      edges,
      variableConfig,
      { requireGrandparents: 'off', requireChildrenContributors: 'off' },
      false,
    );
    expect(issues).toHaveLength(0);
  });
});

describe('geneticParentIds', () => {
  it('returns biological parent edges', () => {
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'biological'],
    ]);

    const result = geneticParentIds('ego', edges, variableConfig);
    expect(result).toContain('mum');
    expect(result).toContain('dad');
    expect(result).toHaveLength(2);
  });

  it('returns donor parent edges', () => {
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['donor', 'ego', 'donor'],
    ]);

    const result = geneticParentIds('ego', edges, variableConfig);
    expect(result).toContain('mum');
    expect(result).toContain('donor');
    expect(result).toHaveLength(2);
  });

  it('does not include adoptive parent edges', () => {
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['dad', 'ego', 'adoptive'],
    ]);

    const result = geneticParentIds('ego', edges, variableConfig);
    expect(result).toContain('mum');
    expect(result).not.toContain('dad');
    expect(result).toHaveLength(1);
  });

  it('does not include social parent edges', () => {
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['step', 'ego', 'social'],
    ]);

    const result = geneticParentIds('ego', edges, variableConfig);
    expect(result).not.toContain('step');
    expect(result).toHaveLength(1);
  });

  it('does not include partner edges', () => {
    const edges = makeEdges([
      ['mum', 'ego', 'biological'],
      ['partner', 'ego', 'partner'],
    ]);

    const result = geneticParentIds('ego', edges, variableConfig);
    expect(result).not.toContain('partner');
    expect(result).toHaveLength(1);
  });

  it('only includes edges pointing TO the node', () => {
    const edges = makeEdges([
      ['ego', 'child', 'biological'],
      ['mum', 'ego', 'biological'],
    ]);

    const result = geneticParentIds('ego', edges, variableConfig);
    expect(result).toContain('mum');
    expect(result).not.toContain('child');
    expect(result).toHaveLength(1);
  });
});

describe('evaluateBoundaries', () => {
  describe('requireGrandparents', () => {
    function setupEgoWithParents() {
      const nodes = makeNodes([
        ['ego', { isEgo: true }],
        ['mum', { name: 'Mum' }],
        ['dad', { name: 'Dad' }],
      ]);
      const baseEdges: [string, string, string][] = [
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
      ];
      return { nodes, baseEdges };
    }

    it('is unmet when a genetic parent has fewer than 2 genetic parents', () => {
      const { nodes, baseEdges } = setupEgoWithParents();
      const grandmum = makeNodes([['grandmum', { name: 'Grandmum' }]]);
      const allNodes = new Map([...nodes, ...grandmum]);
      const edges = makeEdges([
        ...baseEdges,
        ['grandmum', 'mum', 'biological'],
        // dad has 0 grandparents
      ]);

      const issues = evaluateBoundaries(
        'ego',
        allNodes,
        edges,
        variableConfig,
        { requireGrandparents: 'required', requireChildrenContributors: 'off' },
        false,
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.nodeId).toBe('ego');
    });

    it('is met when each genetic parent has at least 2 genetic parents', () => {
      const { nodes, baseEdges } = setupEgoWithParents();
      const gpNodes = makeNodes([
        ['gm1', { name: 'Grandmum1' }],
        ['gf1', { name: 'Granddad1' }],
        ['gm2', { name: 'Grandmum2' }],
        ['gf2', { name: 'Granddad2' }],
      ]);
      const allNodes = new Map([...nodes, ...gpNodes]);
      const edges = makeEdges([
        ...baseEdges,
        ['gm1', 'mum', 'biological'],
        ['gf1', 'mum', 'biological'],
        ['gm2', 'dad', 'biological'],
        ['gf2', 'dad', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        allNodes,
        edges,
        variableConfig,
        { requireGrandparents: 'required', requireChildrenContributors: 'off' },
        false,
      );

      expect(issues).toHaveLength(0);
    });

    it('counts placeholder/unnamed grandparents toward the requirement', () => {
      const { nodes, baseEdges } = setupEgoWithParents();
      const gpNodes = makeNodes([
        ['gm1', { name: '' }],
        ['gf1', { name: 'Granddad1' }],
        ['gm2', { name: 'Grandmum2' }],
        ['gf2', { name: '' }],
      ]);
      const allNodes = new Map([...nodes, ...gpNodes]);
      const edges = makeEdges([
        ...baseEdges,
        ['gm1', 'mum', 'biological'],
        ['gf1', 'mum', 'biological'],
        ['gm2', 'dad', 'donor'],
        ['gf2', 'dad', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        allNodes,
        edges,
        variableConfig,
        { requireGrandparents: 'required', requireChildrenContributors: 'off' },
        false,
      );

      expect(issues).toHaveLength(0);
    });

    it('emits issue with severity matching boundary config (required)', () => {
      const { nodes, baseEdges } = setupEgoWithParents();
      const edges = makeEdges(baseEdges);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        { requireGrandparents: 'required', requireChildrenContributors: 'off' },
        false,
      );

      expect(issues[0]?.severity).toBe('required');
    });

    it('emits issue with severity matching boundary config (recommended)', () => {
      const { nodes, baseEdges } = setupEgoWithParents();
      const edges = makeEdges(baseEdges);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'recommended',
          requireChildrenContributors: 'off',
        },
        false,
      );

      expect(issues[0]?.severity).toBe('recommended');
    });

    it('emits no issue when config is off', () => {
      const { nodes, baseEdges } = setupEgoWithParents();
      const edges = makeEdges(baseEdges);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        { requireGrandparents: 'off', requireChildrenContributors: 'off' },
        false,
      );

      expect(issues).toHaveLength(0);
    });
  });

  describe('requireChildrenContributors', () => {
    function setupEgoWithParents() {
      return makeNodes([
        ['ego', { isEgo: true }],
        ['mum', { name: 'Mum' }],
        ['dad', { name: 'Dad' }],
      ]);
    }

    it('is unmet when ego has 0 children and hasNoChildrenAffirmation is false', () => {
      const nodes = setupEgoWithParents();
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'off',
          requireChildrenContributors: 'required',
        },
        false,
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.nodeId).toBe('ego');
    });

    it('is met when hasNoChildrenAffirmation is true (even with 0 children)', () => {
      const nodes = setupEgoWithParents();
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'off',
          requireChildrenContributors: 'required',
        },
        true,
      );

      expect(issues).toHaveLength(0);
    });

    it('is unmet when co-parent of ego child has fewer than 2 genetic parents', () => {
      const nodes = makeNodes([
        ['ego', { isEgo: true }],
        ['mum', { name: 'Mum' }],
        ['dad', { name: 'Dad' }],
        ['partner', { name: 'Partner' }],
        ['child', { name: 'Child' }],
        ['gm1', { name: 'GM1' }],
      ]);
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
        ['ego', 'child', 'biological'],
        ['partner', 'child', 'biological'],
        // partner has only 1 genetic parent
        ['gm1', 'partner', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'off',
          requireChildrenContributors: 'required',
        },
        false,
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.nodeId).toBe('ego');
    });

    it('is unmet when co-parent of ego child has 2 parents but those parents have fewer than 2 parents each (depth-2)', () => {
      const nodes = makeNodes([
        ['ego', { isEgo: true }],
        ['mum', { name: 'Mum' }],
        ['dad', { name: 'Dad' }],
        ['partner', { name: 'Partner' }],
        ['child', { name: 'Child' }],
        ['pgm', { name: 'Partner-GM' }],
        ['pgf', { name: 'Partner-GF' }],
        // pgm has no parents
      ]);
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
        ['ego', 'child', 'biological'],
        ['partner', 'child', 'biological'],
        ['pgm', 'partner', 'biological'],
        ['pgf', 'partner', 'biological'],
        // pgm and pgf have no parents at all
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'off',
          requireChildrenContributors: 'required',
        },
        false,
      );

      expect(issues).toHaveLength(1);
      expect(issues[0]?.nodeId).toBe('ego');
    });

    it('is met when ego has children with co-parents each having 2 parents and those parents also having 2 parents', () => {
      const nodes = makeNodes([
        ['ego', { isEgo: true }],
        ['mum', { name: 'Mum' }],
        ['dad', { name: 'Dad' }],
        ['partner', { name: 'Partner' }],
        ['child', { name: 'Child' }],
        ['pgm', { name: 'Partner-GM' }],
        ['pgf', { name: 'Partner-GF' }],
        ['ggm1', { name: 'GGM1' }],
        ['ggf1', { name: 'GGF1' }],
        ['ggm2', { name: 'GGM2' }],
        ['ggf2', { name: 'GGF2' }],
      ]);
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
        ['ego', 'child', 'biological'],
        ['partner', 'child', 'biological'],
        ['pgm', 'partner', 'biological'],
        ['pgf', 'partner', 'biological'],
        ['ggm1', 'pgm', 'biological'],
        ['ggf1', 'pgm', 'biological'],
        ['ggm2', 'pgf', 'biological'],
        ['ggf2', 'pgf', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'off',
          requireChildrenContributors: 'required',
        },
        false,
      );

      expect(issues).toHaveLength(0);
    });

    it('emits issue with severity recommended', () => {
      const nodes = setupEgoWithParents();
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        {
          requireGrandparents: 'off',
          requireChildrenContributors: 'recommended',
        },
        false,
      );

      expect(issues[0]?.severity).toBe('recommended');
    });

    it('emits no issue when config is off', () => {
      const nodes = setupEgoWithParents();
      const edges = makeEdges([
        ['mum', 'ego', 'biological'],
        ['dad', 'ego', 'biological'],
      ]);

      const issues = evaluateBoundaries(
        'ego',
        nodes,
        edges,
        variableConfig,
        { requireGrandparents: 'off', requireChildrenContributors: 'off' },
        false,
      );

      expect(issues).toHaveLength(0);
    });
  });
});
