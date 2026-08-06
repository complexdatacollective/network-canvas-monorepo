import { describe, expect, it } from 'vitest';

import {
  asEntityAttributeReference,
  type Stage,
  type Variables,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  RELATIONSHIP_TYPE_OPTIONS,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';
import { resolveGenerationConfig } from '../../config';
import { resolveFamilyPedigreeGenerationOptions } from '../../familyPedigree/referencePopulation';
import { buildEntityConstraints } from '../buildConstraints';
import {
  edgeCountFor,
  inheritedContributorAncestryCeiling,
  nodeCountFor,
  pedigreeEdgeCeiling,
  pedigreeNodeCeiling,
  type NodeConstraintsFor,
  worstCaseEntityCounts,
} from '../entityCounts';
import { SyntheticDataConstraintError } from '../error';

const config = resolveGenerationConfig({ today: '2026-07-27' });

function nameGenerator(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'Name generator',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Name people' }],
    ...overrides,
  } as Stage;
}

function familyPedigree(overrides: Record<string, unknown> = {}): Stage {
  const nodeConfigOverride = (overrides.nodeConfig ?? {}) as Record<
    string,
    unknown
  >;
  return {
    id: 'stage-fp',
    type: 'FamilyPedigree',
    label: 'Pedigree',
    edgeConfig: { type: 'kin' },
    prompts: [],
    ...overrides,
    nodeConfig: {
      type: 'relative',
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
      relationshipVariable: 'relationshipToEgo',
      biologicalSexVariable: 'biologicalSex',
      ...nodeConfigOverride,
    },
  } as unknown as Stage;
}

function alterEdgeForm(...variables: string[]): Stage {
  return {
    id: 'stage-edge-form',
    type: 'AlterEdgeForm',
    label: 'About this relationship',
    subject: { entity: 'edge', type: 'kin' },
    form: {
      fields: variables.map((variable) => ({
        variable,
        prompt: 'Tell us about it',
      })),
    },
  } as unknown as Stage;
}

function nodeAlterForm(nodeType: string, ...variables: string[]): Stage {
  return {
    id: 'stage-alter-form',
    type: 'AlterForm',
    label: 'About this person',
    subject: { entity: 'node', type: nodeType },
    form: {
      fields: variables.map((variable) => ({
        variable,
        prompt: 'Tell us about it',
      })),
    },
  } as unknown as Stage;
}

function filteredNodeAlterForm(
  filtered: string,
  ...variables: string[]
): Stage {
  return {
    ...nodeAlterForm('person', ...variables),
    filter: {
      join: 'AND',
      rules: [
        {
          id: 'node-rule-1',
          type: 'node',
          options: {
            type: 'person',
            attribute: filtered,
            operator: 'EXACTLY',
            value: 1,
          },
        },
      ],
    },
  } as unknown as Stage;
}

/** The same form, gated on a filter rule testing one edge variable. */
function filteredAlterEdgeForm(
  filtered: string,
  ...variables: string[]
): Stage {
  return {
    ...alterEdgeForm(...variables),
    filter: {
      join: 'AND',
      rules: [
        {
          type: 'edge',
          id: 'rule-1',
          options: { type: 'kin', attribute: filtered, operator: 'EXISTS' },
        },
      ],
    },
  } as unknown as Stage;
}

function networkComposer(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-composer',
    type: 'NetworkComposer',
    label: 'Compose',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    layoutVariable: 'layout',
    background: { circles: true },
    edges: [{ id: 'e1', subject: { entity: 'edge', type: 'knows' } }],
    ...overrides,
  } as unknown as Stage;
}

describe('worstCaseEntityCounts', () => {
  it('uses the config node maximum when a stage declares no behaviours', () => {
    const counts = worstCaseEntityCounts([nameGenerator()], config);
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(
      config.nodeCount.max,
    );
  });

  it('uses the stage maxNodes when declared', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 20 } })],
      config,
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(20);
  });

  it('counts a minNodes floor above the config maximum, as the generator does', () => {
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { minNodes: 20 } })],
      config,
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(20);
  });

  it('sums across every stage producing the same node type', () => {
    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ id: 'a', behaviours: { maxNodes: 5 } }),
        nameGenerator({ id: 'b', behaviours: { maxNodes: 7 } }),
      ],
      config,
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(12);
  });

  it('counts creation-time writes per variable on a shared node type', () => {
    const first = nameGenerator({
      id: 'names',
      form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
      behaviours: { minNodes: 5, maxNodes: 5 },
    });
    const second = nameGenerator({
      id: 'ages',
      form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
      behaviours: { minNodes: 7, maxNodes: 7 },
    });

    const counts = worstCaseEntityCounts([first, second], config);

    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(5);
    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(7);
    expect(nodeCountFor(counts.node, 'person', ['isEgo'])).toBe(0);
  });

  it('counts each prompt write against the capacity left when it runs', () => {
    const stage = nameGenerator({
      form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
      prompts: [
        {
          id: 'p1',
          text: 'First prompt',
          additionalAttributes: [{ variable: 'firstFlag', value: true }],
        },
        {
          id: 'p2',
          text: 'Second prompt',
          additionalAttributes: [{ variable: 'secondFlag', value: true }],
        },
        {
          id: 'p3',
          text: 'Third prompt',
          additionalAttributes: [{ variable: 'thirdFlag', value: true }],
        },
      ],
      behaviours: { minNodes: 2, maxNodes: 5 },
    });

    const counts = worstCaseEntityCounts([stage], config);

    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(5);
    expect(nodeCountFor(counts.node, 'person', ['firstFlag'])).toBe(5);
    expect(nodeCountFor(counts.node, 'person', ['secondFlag'])).toBe(3);
    expect(nodeCountFor(counts.node, 'person', ['thirdFlag'])).toBe(1);
  });

  it('applies a later writer only to nodes that already exist', () => {
    const before = nameGenerator({
      id: 'before',
      form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
      behaviours: { minNodes: 5, maxNodes: 5 },
    });
    const writeAge = nodeAlterForm('person', 'age');
    const after = nameGenerator({
      id: 'after',
      form: { fields: [{ variable: 'name', prompt: 'Name?' }] },
      behaviours: { minNodes: 7, maxNodes: 7 },
    });

    const counts = worstCaseEntityCounts([before, writeAge, after], config);

    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(12);
    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(5);
  });

  it('shares pedigree rule closure with the per-variable count', () => {
    const variables = {
      name: { name: 'Name', type: 'text' },
      isEgo: { name: 'Is ego', type: 'boolean' },
      mirrorsEgo: {
        name: 'Mirrors ego',
        type: 'boolean',
        validation: { sameAs: 'isEgo' },
      },
    };
    const counts = worstCaseEntityCounts(
      [familyPedigree()],
      config,
      undefined,
      undefined,
      undefined,
      (type) => (type === 'relative' ? variables : undefined),
    );

    expect(nodeCountFor(counts.node, 'relative', ['mirrorsEgo'])).toBe(
      config.familyPedigreeNodeCount.max,
    );
  });

  it('counts FamilyPedigree nodes against its configured node type', () => {
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(
      config.familyPedigreeNodeCount.max - 1,
    );
    expect(nodeCountFor(counts.node, 'relative', ['isEgo'])).toBe(
      config.familyPedigreeNodeCount.max,
    );
  });

  it('discounts an ego reused by a later compatible pedigree', () => {
    const first = familyPedigree({
      id: 'first-pedigree',
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
    });
    const second = familyPedigree({
      id: 'second-pedigree',
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
    });

    const counts = worstCaseEntityCounts([first, second], config);

    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(
      pedigreeNodeCeiling(config) * 2 - 2,
    );
  });

  it('caps repeated pedigrees at the largest family the population can emit', () => {
    const tightConfig = resolveGenerationConfig({
      today: '2026-08-05',
      familyPedigreeNodeCount: { min: 7, max: 9 },
    });
    const options = resolveFamilyPedigreeGenerationOptions(
      {
        population: {
          id: 'childless',
          label: 'Childless families',
          sources: [],
          completedFamilySize: [{ value: 0, weight: 1 }],
          femaleAtBirthProbability: 0.5,
          childlessPartnerProbability: 1,
          scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
        },
        scenario: 'none',
        diseaseMode: 'none',
        maxNodes: 9,
      },
      9,
    );
    const first = familyPedigree({ id: 'first-pedigree' });
    const second = familyPedigree({ id: 'second-pedigree' });

    const counts = worstCaseEntityCounts(
      [first, second],
      tightConfig,
      undefined,
      undefined,
      options,
    );

    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(14);
  });

  it('retains the full ceiling after an intervening ego-flag rewrite', () => {
    const tightConfig = resolveGenerationConfig({
      today: '2026-08-04',
      familyPedigreeNodeCount: { min: 7, max: 7 },
    });
    const options = resolveFamilyPedigreeGenerationOptions(
      { scenario: 'none', diseaseMode: 'none', maxNodes: 7 },
      7,
    );
    const shared = {
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
    };
    const first = familyPedigree({ ...shared, id: 'first-pedigree' });
    const rewriteEgo = nodeAlterForm('relative', 'isEgo');
    const second = familyPedigree({ ...shared, id: 'second-pedigree' });
    const third = familyPedigree({ ...shared, id: 'third-pedigree' });

    const afterFirst = worstCaseEntityCounts(
      [first, rewriteEgo, second],
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(afterFirst.node, 'relative', ['name'])).toBe(12);

    const beforeFirst = worstCaseEntityCounts(
      [rewriteEgo, first, second],
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(beforeFirst.node, 'relative', ['name'])).toBe(12);

    const restoredBySecond = worstCaseEntityCounts(
      [first, rewriteEgo, second, third],
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(restoredBySecond.node, 'relative', ['name'])).toBe(18);
  });

  it('counts ancestry required for inherited contributor branches', () => {
    const shared = {
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
    };
    const first = familyPedigree({
      ...shared,
      id: 'first-pedigree',
      boundaries: { requireChildrenContributors: 'off' },
    });
    const second = familyPedigree({
      ...shared,
      id: 'second-pedigree',
      boundaries: { requireChildrenContributors: 'required' },
    });

    const counts = worstCaseEntityCounts([first, second], config);

    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(
      pedigreeNodeCeiling(config) * 2 - 2 + 6,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['relationshipType'])).toBe(
      pedigreeEdgeCeiling(config) * 2 + 9,
    );
  });

  it('skips contributor ancestry a tight earlier plan cannot introduce', () => {
    const tightConfig = resolveGenerationConfig({
      today: '2026-08-04',
      familyPedigreeNodeCount: { min: 7, max: 7 },
    });
    const options = resolveFamilyPedigreeGenerationOptions(
      { scenario: 'none', diseaseMode: 'none', maxNodes: 7 },
      7,
    );
    const shared = {
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
    };
    const first = familyPedigree({
      ...shared,
      id: 'first-pedigree',
      boundaries: { requireChildrenContributors: 'off' },
    });
    const second = familyPedigree({
      ...shared,
      id: 'second-pedigree',
      boundaries: { requireChildrenContributors: 'required' },
    });
    const stages = [first, second];

    expect(inheritedContributorAncestryCeiling(1, stages, 7, options)).toEqual({
      nodes: 0,
      edges: 0,
    });
    const counts = worstCaseEntityCounts(
      stages,
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(12);
  });

  it('includes a forced disease sibling when deciding whether children fit', () => {
    const options = resolveFamilyPedigreeGenerationOptions(
      {
        population: {
          id: 'one-child-all-female',
          label: 'One-child, all-female population',
          sources: [],
          completedFamilySize: [{ value: 1, weight: 1 }],
          femaleAtBirthProbability: 1,
          childlessPartnerProbability: 0,
          scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
        },
        scenario: 'none',
        diseaseMode: 'visualization',
        maxNodes: 9,
      },
      9,
    );
    const shared = {
      nodeConfig: {
        type: 'relative',
        egoVariable: 'isEgo',
        biologicalSexVariable: 'biologicalSex',
      },
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
    };
    const first = familyPedigree({
      ...shared,
      id: 'first-pedigree',
      boundaries: { requireChildrenContributors: 'off' },
    });
    const narrative = {
      id: 'narrative',
      type: 'NarrativePedigree',
      label: 'Condition',
      sourceStageId: first.id,
      diseases: [
        {
          id: 'condition',
          label: 'Condition',
          color: '#000000',
          variable: 'condition',
          inheritancePattern: 'xLinkedRecessive',
        },
      ],
    } as unknown as Stage;
    const second = familyPedigree({
      ...shared,
      id: 'second-pedigree',
      boundaries: { requireChildrenContributors: 'required' },
    });
    const stages = [first, narrative, second];

    expect(inheritedContributorAncestryCeiling(2, stages, 8, options)).toEqual({
      nodes: 0,
      edges: 0,
    });
  });

  it('budgets X-linked siblings when a reused ego gets sex from another variable', () => {
    const tightConfig = resolveGenerationConfig({
      today: '2026-08-04',
      familyPedigreeNodeCount: { min: 7, max: 7 },
    });
    const options = resolveFamilyPedigreeGenerationOptions(
      {
        population: {
          id: 'all-male',
          label: 'All male births',
          sources: [],
          completedFamilySize: [{ value: 0, weight: 1 }],
          femaleAtBirthProbability: 0,
          childlessPartnerProbability: 0,
          scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
        },
        scenario: 'none',
        diseaseMode: 'visualization',
        maxNodes: 7,
      },
      7,
    );
    const first = familyPedigree({
      id: 'first-pedigree',
      nodeConfig: {
        type: 'relative',
        egoVariable: 'isEgo',
        biologicalSexVariable: 'firstSex',
      },
    });
    const second = familyPedigree({
      id: 'second-pedigree',
      nodeConfig: {
        type: 'relative',
        egoVariable: 'isEgo',
        biologicalSexVariable: 'secondSex',
      },
    });
    const narrative = {
      id: 'narrative',
      type: 'NarrativePedigree',
      label: 'Condition',
      sourceStageId: second.id,
      diseases: [
        {
          id: 'condition',
          label: 'Condition',
          color: '#000000',
          variable: 'condition',
          inheritancePattern: 'xLinkedRecessive',
        },
      ],
    } as unknown as Stage;
    const stages = [first, second, narrative];

    const counts = worstCaseEntityCounts(
      stages,
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(13);
  });

  it('budgets X-linked siblings after an intervening sex-variable rewrite', () => {
    const tightConfig = resolveGenerationConfig({
      today: '2026-08-04',
      familyPedigreeNodeCount: { min: 7, max: 7 },
    });
    const options = resolveFamilyPedigreeGenerationOptions(
      {
        population: {
          id: 'all-male',
          label: 'All male births',
          sources: [],
          completedFamilySize: [{ value: 0, weight: 1 }],
          femaleAtBirthProbability: 0,
          childlessPartnerProbability: 0,
          scenarios: { adoption: 0, donorConception: 0, surrogacy: 0 },
        },
        scenario: 'none',
        diseaseMode: 'visualization',
        maxNodes: 7,
      },
      7,
    );
    const sharedNodeConfig = {
      type: 'relative',
      egoVariable: 'isEgo',
      biologicalSexVariable: 'biologicalSex',
    };
    const first = familyPedigree({
      id: 'first-pedigree',
      nodeConfig: sharedNodeConfig,
    });
    const rewriteSex = {
      id: 'rewrite-sex',
      type: 'CategoricalBin',
      label: 'Rewrite sex',
      subject: { entity: 'node', type: 'relative' },
      prompts: [
        {
          id: 'sex-bin',
          text: 'Group by sex',
          variable: 'biologicalSex',
        },
      ],
    } as unknown as Stage;
    const second = familyPedigree({
      id: 'second-pedigree',
      nodeConfig: sharedNodeConfig,
    });
    const narrative = {
      id: 'narrative',
      type: 'NarrativePedigree',
      label: 'Condition',
      sourceStageId: second.id,
      diseases: [
        {
          id: 'condition',
          label: 'Condition',
          color: '#000000',
          variable: 'condition',
          inheritancePattern: 'xLinkedRecessive',
        },
      ],
    } as unknown as Stage;

    const afterFirst = worstCaseEntityCounts(
      [first, rewriteSex, second, narrative],
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(afterFirst.node, 'relative', ['name'])).toBe(13);

    const beforeFirst = worstCaseEntityCounts(
      [rewriteSex, first, second, narrative],
      tightConfig,
      undefined,
      undefined,
      options,
    );
    expect(nodeCountFor(beforeFirst.node, 'relative', ['name'])).toBe(12);
  });

  it('bounds every contributor branch introduced by an intervening pairing stage', () => {
    const shared = {
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
    };
    const first = familyPedigree({
      ...shared,
      id: 'first-pedigree',
      boundaries: { requireChildrenContributors: 'off' },
    });
    const pairing = {
      id: 'pair-relatives',
      type: 'Sociogram',
      label: 'Pair relatives',
      subject: { entity: 'node', type: 'relative' },
      prompts: [
        {
          id: 'pair-prompt',
          text: 'Connect relatives',
          edges: { create: 'kin' },
        },
      ],
    } as unknown as Stage;
    const second = familyPedigree({
      ...shared,
      id: 'second-pedigree',
      boundaries: { requireChildrenContributors: 'required' },
    });
    const stages = [first, pairing, second];
    const inheritedPopulation = pedigreeNodeCeiling(config);

    expect(
      inheritedContributorAncestryCeiling(2, stages, inheritedPopulation),
    ).toEqual({
      nodes: inheritedPopulation * 8,
      edges: inheritedPopulation * 12,
    });

    const counts = worstCaseEntityCounts(stages, config);
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(
      inheritedPopulation * 10 - 2,
    );
  });

  it('starts contributor scans after a reusable ego with different edge semantics', () => {
    const sharedNodeConfig = {
      type: 'relative',
      egoVariable: 'isEgo',
    };
    const first = familyPedigree({
      id: 'first-pedigree',
      nodeConfig: sharedNodeConfig,
      edgeConfig: {
        type: 'legacy-kin',
        relationshipTypeVariable: 'legacyRelationshipType',
      },
    });
    const pairing = {
      id: 'pair-relatives',
      type: 'Sociogram',
      label: 'Pair relatives',
      subject: { entity: 'node', type: 'relative' },
      prompts: [
        {
          id: 'pair-prompt',
          text: 'Connect relatives',
          edges: { create: 'kin' },
        },
      ],
    } as unknown as Stage;
    const second = familyPedigree({
      id: 'second-pedigree',
      nodeConfig: sharedNodeConfig,
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
      boundaries: { requireChildrenContributors: 'required' },
    });
    const stages = [first, pairing, second];
    const inheritedPopulation = pedigreeNodeCeiling(config);

    expect(
      inheritedContributorAncestryCeiling(2, stages, inheritedPopulation),
    ).toEqual({
      nodes: inheritedPopulation * 8,
      edges: inheritedPopulation * 12,
    });
  });

  it('ignores graph writers that run before the first compatible pedigree', () => {
    const shared = {
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
      edgeConfig: {
        type: 'kin',
        relationshipTypeVariable: 'relationshipType',
      },
    };
    const pairing = {
      id: 'pair-before-pedigree',
      type: 'Sociogram',
      label: 'Pair relatives',
      subject: { entity: 'node', type: 'relative' },
      prompts: [
        {
          id: 'pair-prompt',
          text: 'Connect relatives',
          edges: { create: 'kin' },
        },
      ],
    } as unknown as Stage;
    const first = familyPedigree({
      ...shared,
      id: 'first-pedigree',
      boundaries: { requireChildrenContributors: 'off' },
    });
    const second = familyPedigree({
      ...shared,
      id: 'second-pedigree',
      boundaries: { requireChildrenContributors: 'required' },
    });
    const inheritedPopulation = pedigreeNodeCeiling(config);

    expect(
      inheritedContributorAncestryCeiling(
        2,
        [pairing, first, second],
        inheritedPopulation,
      ),
    ).toEqual({ nodes: 6, edges: 9 });
  });

  it('does not discount pedigrees with different ego variables', () => {
    const first = familyPedigree({
      id: 'first-pedigree',
      nodeConfig: { type: 'relative', egoVariable: 'isEgo' },
    });
    const second = familyPedigree({
      id: 'second-pedigree',
      nodeConfig: { type: 'relative', egoVariable: 'isDifferentEgo' },
    });

    const counts = worstCaseEntityCounts([first, second], config);

    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(
      pedigreeNodeCeiling(config) * 2 - 2,
    );
  });

  it('leaves pedigree edges uncounted when no stage names an attribute of their type', () => {
    // This partial fixture configures no semantic edge variables, so the
    // materializer leaves every pedigree edge attribute-free.
    const counts = worstCaseEntityCounts([familyPedigree()], config);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('counts pedigree edges once a stage names an attribute of their type', () => {
    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('verified')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(
      pedigreeEdgeCeiling(config),
    );
  });

  it('counts pedigree edges per variable, not per type', () => {
    // `handleAlterEdgeForm` passes its field list to `generateEntityAttributes`
    // as `only`, so a variable the form does not render is `undefined` on every
    // pedigree edge even though a sibling variable of the same type is filled.
    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('note')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['note'])).toBe(
      pedigreeEdgeCeiling(config),
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('counts an unnamed variable on edges another stage creates', () => {
    // Only pedigree edges are exempted. A Sociogram generates the whole
    // attribute set of every edge it creates, so `verified` is on all six of
    // them whether or not a form ever mentions it.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 4 } }), sociogram],
      config,
    );
    // C(4, 2) = 6
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(6);
  });

  it('folds pedigree edges into a later pairing of the same node type', () => {
    // The sociogram pairs every relative the pedigree built. The pedigree's
    // parentage edges already occupy pairs in that complete graph, and
    // `createEdgesForPairs` reuses whichever of them the sociogram meets.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'relative' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [familyPedigree(), sociogram, alterEdgeForm('note')],
      config,
    );
    const nodes = pedigreeNodeCeiling(config);
    const pairs = (nodes * (nodes - 1)) / 2;
    expect(edgeCountFor(counts.edge, 'kin', ['note'])).toBe(pairs);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(pairs);
  });

  it('keeps pedigree edges apart from a pairing that ran before them', () => {
    // The sociogram runs before any relative exists, so it pairs nobody and its
    // pair set cannot hold the pedigree's edges. Folding them in on the strength
    // of the stage merely existing would report zero for nine real edges.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'relative' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [sociogram, familyPedigree(), alterEdgeForm('note')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['note'])).toBe(
      pedigreeEdgeCeiling(config),
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('reads only edge-subject references, not a node type of the same name', () => {
    // Node and edge codebooks are separate namespaces, so an attribute named on
    // a node type says nothing about what fills an edge of the same name.
    const alterForm = {
      id: 'stage-node-form',
      type: 'AlterForm',
      label: 'About them',
      subject: { entity: 'node', type: 'kin' },
      form: { fields: [{ variable: 'verified', prompt: 'Verified?' }] },
    } as unknown as Stage;

    const counts = worstCaseEntityCounts([familyPedigree(), alterForm], config);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('reads a filter rule as a reader, not a naming site', () => {
    // A filter tests a value the form does not render, and
    // `handleAlterEdgeForm` passes only its field list to
    // `generateEntityAttributes` — so the filtered variable stays undefined on
    // every pedigree edge. The schema says as much on its own: an
    // `entityAttributeReference({ subject: 'filterRule' })` resolves no
    // subject, exactly as an ego filter rule names no ego scope.
    const filtered = filteredAlterEdgeForm('verified', 'note');

    const counts = worstCaseEntityCounts([familyPedigree(), filtered], config);
    expect(edgeCountFor(counts.edge, 'kin', ['note'])).toBe(
      pedigreeEdgeCeiling(config),
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('counts a variable a filter tests and the form also renders', () => {
    // Reading and writing one variable is writing it. The filter must not be
    // able to take a form field's own variable back out of the count.
    const counts = worstCaseEntityCounts(
      [familyPedigree(), filteredAlterEdgeForm('verified', 'verified')],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(
      pedigreeEdgeCeiling(config),
    );
  });

  it('counts an inverted FamilyPedigree range as the generator draws it', () => {
    // `randomInt` collapses an inverted range to its `min`, so the stage builds
    // 20 nodes and 19 edges; reading `max` alone would report 10 and 9.
    const inverted = resolveGenerationConfig({
      today: '2026-07-27',
      familyPedigreeNodeCount: { min: 20, max: 10 },
    });

    const counts = worstCaseEntityCounts(
      [familyPedigree(), alterEdgeForm('verified')],
      inverted,
    );
    expect(nodeCountFor(counts.node, 'relative', ['name'])).toBe(19);
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(
      pedigreeEdgeCeiling(inverted),
    );
  });

  it('bounds an edge type by the pair count over its node type', () => {
    const stages = [
      nameGenerator({ behaviours: { maxNodes: 4 } }),
      {
        id: 'stage-2',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      } as unknown as Stage,
    ];

    // C(4, 2) = 6
    const counts = worstCaseEntityCounts(stages, config);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(6);
  });

  it('bounds a NetworkComposer edge by the composer own node ceiling', () => {
    // `handleNetworkComposer` pairs the `newNodes` it just built, so the five
    // people the name generator added are never among them: C(2, 2) = 1, where
    // the protocol-wide total would claim C(7, 2) = 21.
    const twoNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 2, max: 2 },
    });

    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ behaviours: { minNodes: 5, maxNodes: 5 } }),
        networkComposer(),
      ],
      twoNodes,
    );
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });

  it('counts an inverted composer node range as the generator draws it', () => {
    // `randomInt` collapses an inverted range to its `min`, so the composer
    // builds six people and pairs C(6, 2) = 15 of them. Reading the configured
    // `max` alone would report a single pair and let a `unique` edge variable
    // through that the draw then runs out of values for.
    const inverted = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 6, max: 2 },
    });

    const counts = worstCaseEntityCounts([networkComposer()], inverted);
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(6);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(15);
  });

  it('sums the pairs of every composer creating one edge type', () => {
    // Each composer pairs only its own people, but a `unique` value is claimed
    // once for the whole run, so the two stages' pairs add up.
    const threeNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 3, max: 3 },
    });

    const counts = worstCaseEntityCounts(
      [networkComposer(), networkComposer({ id: 'second' })],
      threeNodes,
    );
    // C(3, 2) = 3 apiece.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(6);
  });

  it('leaves a census reading the whole node total, composer people included', () => {
    // Only the composer is stage-local. A DyadCensus pairs whatever the draft
    // holds when it runs, so the people a composer added are among its
    // candidates and narrowing it the same way would under-count it.
    const twoNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 2, max: 2 },
    });

    const census = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ behaviours: { minNodes: 5, maxNodes: 5 } }),
        networkComposer(),
        census,
      ],
      twoNodes,
    );
    // C(7, 2) = 21 for the census over all seven people, and nothing more for
    // the composer: its own pair is one of those 21, and the census reuses
    // whichever edge the composer already left on it.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(21);
  });

  it('counts one census pair set however many prompts and stages ask for it', () => {
    // Every prompt of every census and Sociogram naming an edge type draws from
    // the same set of pairs, and `createEdgesForPairs` reuses the edge already
    // on a pair rather than drawing another, so the type is bounded once.
    const census = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        { id: 'p2', text: 'Are they close?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Who knows who?', edges: { create: 'knows' } },
      ],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ behaviours: { minNodes: 4, maxNodes: 4 } }),
        census,
        sociogram,
      ],
      config,
    );
    // C(4, 2) = 6, not 6 per prompt across the three of them.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(6);
  });

  it('sums the pair sets of two node types creating one edge type', () => {
    // A pair is two nodes of one type, so a census over `person` and a census
    // over `place` reach disjoint pairs even though both create `knows`.
    const people = {
      id: 'stage-people',
      type: 'DyadCensus',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const places = {
      id: 'stage-places',
      type: 'DyadCensus',
      label: 'Places',
      subject: { entity: 'node', type: 'place' },
      prompts: [
        { id: 'p1', text: 'Are these connected?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [
        nameGenerator({ behaviours: { minNodes: 4, maxNodes: 4 } }),
        nameGenerator({
          id: 'stage-places-ng',
          subject: { entity: 'node', type: 'place' },
          behaviours: { minNodes: 3, maxNodes: 3 },
        }),
        people,
        places,
      ],
      config,
    );
    // C(4, 2) = 6 plus C(3, 2) = 3.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(9);
  });

  it('counts a composer pairing one type twice only once', () => {
    // `handleNetworkComposer` pushes each definition's edges onto the draft
    // before the next definition runs, so the second finds the first's edge on
    // the pair and reuses it.
    const threeNodes = resolveGenerationConfig({
      today: '2026-07-27',
      nodeCount: { min: 3, max: 3 },
    });

    const counts = worstCaseEntityCounts(
      [
        networkComposer({
          edges: [
            { id: 'e1', subject: { entity: 'edge', type: 'knows' } },
            { id: 'e2', subject: { entity: 'edge', type: 'knows' } },
          ],
        }),
      ],
      threeNodes,
    );
    // C(3, 2) = 3, not 3 per definition.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
  });

  it('counts nothing for a composer whose subject names no node type', () => {
    // `handleNetworkComposer` returns before building anything, so neither its
    // people nor its edges exist.
    const counts = worstCaseEntityCounts(
      [networkComposer({ subject: { entity: 'edge', type: 'knows' } })],
      config,
    );
    expect(counts.edge.base.size).toBe(0);
  });

  it('still counts a filtered census at its unfiltered pair count', () => {
    // Whether a node passes a stage's filter depends on values no analysis has
    // drawn yet, so the only sound ceiling is the one where every node passes.
    // Narrowing this by reading the filter would be an under-count wherever the
    // reading is wrong, and an under-count lets a `unique` variable through and
    // runs the draw out of values partway. Deliberately the same number the
    // same census without a filter reaches.
    const filtered = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      filter: {
        rules: [
          {
            id: 'r1',
            type: 'node',
            options: {
              type: 'person',
              attribute: 'band',
              operator: 'EXACTLY',
              value: 1,
            },
          },
        ],
      },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { minNodes: 3, maxNodes: 3 } }), filtered],
      config,
    );
    // C(3, 2) = 3.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
  });

  it('returns empty maps for a protocol with no entity-producing stages', () => {
    const stage = {
      id: 'stage-info',
      type: 'Information',
      label: 'Info',
      items: [],
    } as unknown as Stage;

    const counts = worstCaseEntityCounts([stage], config);
    expect(counts.node.size).toBe(0);
    expect(counts.edge.base.size).toBe(0);
    expect(counts.edge.pedigree.size).toBe(0);
  });
});

function rosterStage(overrides: Record<string, unknown> = {}): Stage {
  return {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'roster-asset',
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { maxNodes: 3 },
    ...overrides,
  } as unknown as Stage;
}

function rosterRow(uid: string): NcNode {
  return {
    [entityPrimaryKeyProperty]: uid,
    type: 'person',
    [entityAttributesProperty]: {},
  };
}

function valuedRow(
  uid: string,
  attributes: Record<string, VariableValue>,
): NcNode {
  return {
    [entityPrimaryKeyProperty]: uid,
    type: 'person',
    [entityAttributesProperty]: attributes,
  };
}

describe('worstCaseEntityCounts with roster rows', () => {
  it('counts nothing for a roster stage whose roster is known to be empty', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [],
    });
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(0);
  });

  it('caps a roster stage at the rows its roster holds', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [rosterRow('a'), rosterRow('b')],
    });
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(2);
  });

  it('keeps the configured maximum when the roster holds more rows than that', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': ['a', 'b', 'c', 'd', 'e'].map(rosterRow),
    });
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(3);
  });

  it('counts the configured maximum when the stage has no roster entry', () => {
    // The roster could not be resolved, so `createNodesForStage` fabricates to
    // the stage's node counts. Counting the rows that did resolve for another
    // stage would under-count this one.
    const counts = worstCaseEntityCounts(
      [rosterStage(), rosterStage({ id: 'other' })],
      config,
      { other: [] },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(3);
  });

  it('counts the configured maximum when no roster rows are supplied at all', () => {
    const counts = worstCaseEntityCounts([rosterStage()], config);
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(3);
  });

  it('counts a roster panel on a fabricating name generator at the full maximum', () => {
    // A NameGenerator draws from its panel but is not bounded by it: it
    // fabricates the rest of its nodes.
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-1': [] },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(4);
  });

  it('counts rows once when two roster stages draw the same roster', () => {
    // Rows are drawn without replacement across stages, so between them the two
    // stages can produce at most one node per row — four, not the six their
    // configured maxima sum to.
    const rows = ['a', 'b', 'c', 'd'].map(rosterRow);
    const counts = worstCaseEntityCounts(
      [rosterStage(), rosterStage({ id: 'second' })],
      config,
      { 'stage-roster': rows, 'second': rows },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(4);
  });

  it('holds each roster stage to its own bound when their rosters share no rows', () => {
    // One stage is bounded by its single row, the other by its own maximum,
    // and neither can spend the rows the other was given.
    const counts = worstCaseEntityCounts(
      [
        rosterStage({ behaviours: { maxNodes: 5 } }),
        rosterStage({ id: 'second', behaviours: { maxNodes: 1 } }),
      ],
      config,
      {
        'stage-roster': [rosterRow('a')],
        'second': ['b', 'c', 'd'].map(rosterRow),
      },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(2);
  });

  it('adds a fabricating stage to a roster stage capped by its rows', () => {
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-roster': [rosterRow('a')] },
    );
    expect(nodeCountFor(counts.node, 'person', ['name'])).toBe(5);
  });

  it('bounds an edge type by the pairs a roster-capped node count reaches', () => {
    const stages = [
      rosterStage(),
      {
        id: 'stage-census',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      } as unknown as Stage,
    ];

    // C(2, 2) = 1, where the uncapped stage maximum would claim C(3, 2) = 3.
    const counts = worstCaseEntityCounts(stages, config, {
      'stage-roster': [rosterRow('a'), rosterRow('b')],
    });
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });
});

describe('worstCaseEntityCounts with roster rows carrying values', () => {
  it('counts rows repeating one value as the single value they spend', () => {
    // The third row's `true` is already in the network by the time it comes up,
    // so `rosterRowIsDrawable` passes it over: two of the three rows are all
    // this roster can put into the network for `consented`.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        valuedRow('c', { consented: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(2);
  });

  it('leaves a variable those rows say nothing about at the full row count', () => {
    // Nothing passes a row over for a variable it does not carry: all three
    // rows are drawn and the draw supplies `nickname` on each of them.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        valuedRow('c', { consented: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['nickname'])).toBe(3);
  });

  it('counts a row leaving the variable unset as a value the draw still spends', () => {
    // `createNodesForStage` generates the node around only what the row
    // supplies, so a row with no `consented` is asked for one exactly as a
    // fabricated node is — and spends a value of the space just the same.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        rosterRow('c'),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(3);
  });

  it('judges sameness as the unique registry does, not as raw JSON would', () => {
    // Two orderings of one categorical selection are one value to
    // `isMatchingValue`, so the second row repeats the first and is passed
    // over. Keying on raw JSON would call them two values and count two rows.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { tags: ['x', 'y'] }),
        valuedRow('b', { tags: ['y', 'x'] }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['tags'])).toBe(1);
  });

  it('adds a fabricating stage to what the roster can spend', () => {
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 2 } })],
      config,
      {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: true }),
        ],
      },
    );
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(3);
  });

  it('counts one node per primary key when one pool repeats it', () => {
    // `createNodesForStage` adds each drawn row's key to the shared
    // `usedRosterUids`, and `rowIsDrawable` turns away every later row carrying
    // a key that set holds — so three rows under one key are three descriptions
    // of one person, not three people. Counting a node per copy would claim
    // value spends and pairs nothing reaches.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        rosterRow('a'),
        rosterRow('a'),
      ],
    });

    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(1);
    expect(nodeCountFor(counts.node, 'person', ['nickname'])).toBe(1);
  });

  it('holds a repeated key to one node for the pairs it can reach', () => {
    const stages = [
      rosterStage(),
      {
        id: 'stage-census',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      } as unknown as Stage,
    ];

    // Two keys among three rows are two people, so C(2, 2) = 1 pair — where
    // counting the repeat as its own person would claim C(3, 2) = 3.
    const counts = worstCaseEntityCounts(stages, config, {
      'stage-roster': [rosterRow('a'), rosterRow('a'), rosterRow('b')],
    });

    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });

  it('counts one row per primary key when two stages offer the same value', () => {
    // Rows are drawn without replacement across stages, so the second stage
    // never sees a key the first took — and the value it carries is spent once.
    const rows = [
      valuedRow('a', { consented: true }),
      valuedRow('b', { consented: true }),
    ];
    const counts = worstCaseEntityCounts(
      [rosterStage(), rosterStage({ id: 'second' })],
      config,
      { 'stage-roster': rows, 'second': rows },
    );
    expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(1);
  });

  it('holds a repeated value against the pairs its rows can still reach', () => {
    // An edge is created for a pair of people whatever they hold, so the pair
    // count reads the whole roster: `consented` sending two rows to the same
    // value takes nothing away from a stage pairing all three of them.
    const stages = [
      rosterStage(),
      {
        id: 'stage-census',
        type: 'DyadCensus',
        label: 'Census',
        subject: { entity: 'node', type: 'person' },
        prompts: [
          { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
        ],
      } as unknown as Stage,
    ];

    const counts = worstCaseEntityCounts(stages, config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        valuedRow('c', { consented: true }),
      ],
    });
    // C(3, 2) = 3, over every row rather than the two `consented` can tell
    // apart.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
  });
});

describe('worstCaseEntityCounts across a unique equality group', () => {
  it('counts rows a group member repeats as the one node they build', () => {
    // Every row carries `consented` and none carries the variable held equal
    // to it. Read one member at a time, `mirror` is three people the draw must
    // tell apart; read across the group, the rows share one `unique` slot, so
    // the first claims `true` and `rosterRowIsDrawable` passes the rest over.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: true }),
        valuedRow('c', { consented: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      1,
    );
  });

  it('counts one value two rows carry on different members once', () => {
    // One row supplies `consented` and the other the variable held equal to
    // it, both saying `true`. That is one value of the group's slot between
    // them, so only one of the two rows is ever drawable.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { mirror: true }),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      1,
    );
  });

  it('still counts every row when the group values they carry differ', () => {
    // Two rows spending a boolean each, and a third carrying neither member —
    // which the draw is asked to supply a group value for, exactly as it would
    // for a fabricated person. Nothing here is passed over.
    const counts = worstCaseEntityCounts([rosterStage()], config, {
      'stage-roster': [
        valuedRow('a', { consented: true }),
        valuedRow('b', { consented: false }),
        rosterRow('c'),
      ],
    });
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      3,
    );
  });

  it('adds a fabricating stage to what the group can spend', () => {
    // The roster's three rows build one person between them; the name
    // generator's two are drawn against the same slot and spend one apiece.
    const counts = worstCaseEntityCounts(
      [rosterStage(), nameGenerator({ id: 'ng', behaviours: { maxNodes: 2 } })],
      config,
      {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: true }),
          valuedRow('c', { consented: true }),
        ],
      },
    );
    expect(nodeCountFor(counts.node, 'person', ['consented', 'mirror'])).toBe(
      3,
    );
  });
});

/**
 * `createNodesForStage` settles a candidate row two ways, and only one of them
 * is settled by the protocol. `rosterRowIsDrawable` asks what the network has
 * already claimed, which the seed decides — a row it turns away on one seed is
 * drawn on another. `rulesAllow` asks what the type's rules say about the
 * assignment the node will actually be written with, which nothing decides but
 * the codebook and the row, so a row it rejects is one no seed can draw.
 *
 * These pin that line in both directions: a row the rules reject is out of
 * every ceiling it used to raise, while every row only the seed would have
 * passed over keeps being counted.
 */
describe('worstCaseEntityCounts with roster rows the rules reject', () => {
  const TODAY = '2026-07-27';

  /** The lookup `analyseFeasibility` supplies, over a single node type. */
  function constraintsFor(
    byType: Record<string, Variables>,
    unvalidated: ReadonlySet<string> = new Set(),
  ): NodeConstraintsFor {
    return (nodeType) => {
      const variables = byType[nodeType];
      return variables === undefined
        ? undefined
        : buildEntityConstraints(variables, TODAY, unvalidated);
    };
  }

  function personConstraints(variables: Variables): NodeConstraintsFor {
    return constraintsFor({ person: variables });
  }

  const adult = personConstraints({
    age: { name: 'Age', type: 'number', validation: { minValue: 18 } },
  });

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const underage = {
    'stage-roster': [
      valuedRow('a', { age: 5 }),
      valuedRow('b', { age: 6 }),
      valuedRow('c', { age: 7 }),
    ],
  };

  it('counts every row when no constraints are supplied', () => {
    // The reading before the rules are known, kept as the safe direction: a
    // caller who cannot say which rows are drawable gets the whole pool.
    const counts = worstCaseEntityCounts(
      [rosterStage(), census],
      config,
      underage,
    );

    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(3);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
  });

  it('counts no node and no pair for rows the variable’s own bounds reject', () => {
    // Every row is below the floor `age` declares, so `ruleBrokenByFixedValues`
    // turns each of them away before any drawing and the stage builds nobody.
    // Counting them claimed three people and C(3, 2) = 3 pairs, which refused a
    // two-value `unique` edge domain over edges the run never creates.
    const counts = worstCaseEntityCounts(
      [rosterStage(), census],
      config,
      underage,
      adult,
    );

    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(0);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(0);
  });

  it('keeps counting rows whose values their own rules accept', () => {
    // The same shape with ages the protocol admits. Nothing here is narrowed,
    // so the refusal this pair of counts stands behind still stands.
    const counts = worstCaseEntityCounts([rosterStage(), census], config, {
      'stage-roster': [
        valuedRow('a', { age: 25 }),
        valuedRow('b', { age: 30 }),
        valuedRow('c', { age: 35 }),
      ],
    });

    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(3);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(3);
  });

  it('counts the rows the rules admit out of a mixed roster', () => {
    const counts = worstCaseEntityCounts(
      [rosterStage({ behaviours: { maxNodes: 5 } }), census],
      config,
      {
        'stage-roster': [
          valuedRow('a', { age: 25 }),
          valuedRow('b', { age: 6 }),
          valuedRow('c', { age: 35 }),
          valuedRow('d', { age: 7 }),
        ],
      },
      adult,
    );

    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(2);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });

  it('counts no node for a row breaking a rule between two of its own values', () => {
    const dated = personConstraints({
      startYear: { name: 'Start', type: 'number' },
      endYear: {
        name: 'End',
        type: 'number',
        validation: {
          greaterThanVariable: asEntityAttributeReference('startYear'),
        },
      },
    });

    const counts = worstCaseEntityCounts(
      [rosterStage()],
      config,
      {
        'stage-roster': [
          valuedRow('a', { startYear: 2020, endYear: 2010 }),
          valuedRow('b', { startYear: 2000, endYear: 2015 }),
        ],
      },
      dated,
    );

    expect(nodeCountFor(counts.node, 'person', ['endYear'])).toBe(1);
  });

  it('counts no node for a row leaving the draw no value to complete around', () => {
    // Nothing the row carries breaks a rule on its own or against another value
    // it carries: `endYear` is simply pinned where the comparator leaves its
    // partner nothing under its own ceiling. That is the completability fold
    // `completionCheckFor` performs, and the draw passes the row over by it.
    const capped = personConstraints({
      startYear: { name: 'Start', type: 'number' },
      endYear: {
        name: 'End',
        type: 'number',
        validation: {
          maxValue: 2000,
          greaterThanVariable: asEntityAttributeReference('startYear'),
        },
      },
    });

    const counts = worstCaseEntityCounts(
      [rosterStage()],
      config,
      {
        'stage-roster': [
          valuedRow('a', { startYear: 2000 }),
          valuedRow('b', { startYear: 1990 }),
        ],
      },
      capped,
    );

    expect(nodeCountFor(counts.node, 'person', ['startYear'])).toBe(1);
  });

  /**
   * A roster interface never fabricates, so `fixedValuesFor` spreads the row's
   * own values over the prompt's rather than the other way round. Which of the
   * two wins decides whether a row is drawable at all, so the merge is pinned
   * here rather than left to the rule check to imply.
   */
  describe('against the values a prompt fixes', () => {
    const exclusive = personConstraints({
      consented: { name: 'Consented', type: 'boolean' },
      flag: {
        name: 'Flag',
        type: 'boolean',
        validation: {
          differentFrom: asEntityAttributeReference('consented'),
        },
      },
    });

    function promptedRoster(...additional: string[][]): Stage {
      return rosterStage({
        prompts: additional.map((variables, index) => ({
          id: `p${index + 1}`,
          text: 'Pick people',
          additionalAttributes: variables.map((variable) => ({
            variable,
            value: true,
          })),
        })),
      });
    }

    it('judges a row against the assignment its node is written with', () => {
      // The prompt writes `flag: true` onto every node it builds, and the row
      // says `consented: true`, which the two cannot both be. Judging the row
      // on its own would have counted a person the stage never adds.
      const counts = worstCaseEntityCounts(
        [promptedRoster(['flag'])],
        config,
        { 'stage-roster': [valuedRow('a', { consented: true })] },
        exclusive,
      );

      expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(0);
    });

    it('lets the row win the collision, as the roster interface does', () => {
      // The prompt fixes both variables to a pair that cannot stand, and the
      // row overrides one of them. On a roster stage the row's value is what
      // the node holds, so the assignment is fine and the row is drawable;
      // reading the panel's merge instead would have dropped it.
      const counts = worstCaseEntityCounts(
        [promptedRoster(['consented', 'flag'])],
        config,
        { 'stage-roster': [valuedRow('a', { consented: false })] },
        exclusive,
      );

      expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(1);
    });

    it('keeps a row any one of the stage’s prompts admits', () => {
      // Which prompt draws a row is the seed's business, so a row the first
      // prompt's values turn away is still drawable under the second.
      const counts = worstCaseEntityCounts(
        [promptedRoster(['flag'], [])],
        config,
        { 'stage-roster': [valuedRow('a', { consented: true })] },
        exclusive,
      );

      expect(nodeCountFor(counts.node, 'person', ['consented'])).toBe(1);
    });
  });

  /**
   * The other half of the line. Every rejection below is one the seed settles,
   * so the rows stay counted exactly as they were before the rules were read.
   */
  describe('leaving the seed-settled pass-overs counted', () => {
    const uniqueNickname = personConstraints({
      nickname: {
        name: 'Nickname',
        type: 'text',
        validation: { unique: true },
      },
    });

    it('counts a row repeating a claimed unique value against the pairs', () => {
      // The second row is passed over only where the first was drawn first, so
      // both rows can build a person and both are inside the census's pair set.
      // What the repeat costs is the value space, which `rosterValueCount`
      // settles on its own and which the pair count does not read.
      const counts = worstCaseEntityCounts(
        [rosterStage(), census],
        config,
        {
          'stage-roster': [
            valuedRow('a', { nickname: 'Sam' }),
            valuedRow('b', { nickname: 'Sam' }),
          ],
        },
        uniqueNickname,
      );

      expect(nodeCountFor(counts.node, 'person', ['nickname'])).toBe(1);
      expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
    });

    it('counts every shared row for a later node type', () => {
      // The narrowing that was declined: an earlier stage with a floor of zero
      // may consume none of the rows, so the later type really can reach all of
      // them. Reading the rules changes nothing about it.
      const shared = ['a', 'b', 'c'].map(rosterRow);
      const counts = worstCaseEntityCounts(
        [
          rosterStage({
            id: 'roster-person',
            behaviours: { minNodes: 0, maxNodes: 3 },
          }),
          rosterStage({
            id: 'roster-org',
            subject: { entity: 'node', type: 'organization' },
            behaviours: { minNodes: 3, maxNodes: 3 },
          }),
        ],
        config,
        { 'roster-person': shared, 'roster-org': shared },
        constraintsFor({
          person: {},
          organization: { flag: { name: 'Flag', type: 'boolean' } },
        }),
      );

      expect(nodeCountFor(counts.node, 'organization', ['flag'])).toBe(3);
    });
  });

  it('keeps a row only a rule the interview never applies would reject', () => {
    // The constraints read here are the draw's own, so a variable whose rules
    // nothing applies — a binning stage's, which `buildEntityConstraints`
    // strips — has no rule for a row to break. Judging the declared rules
    // instead would pass over a row the draw builds a person from, and
    // under-count the type against a `unique` variable it really does spend.
    const counts = worstCaseEntityCounts(
      [rosterStage()],
      config,
      underage,
      constraintsFor(
        {
          person: {
            age: { name: 'Age', type: 'number', validation: { minValue: 18 } },
          },
        },
        new Set(['age']),
      ),
    );

    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(3);
  });

  it('draws none of those rows and none of their edges, on any seed', () => {
    // The proof the zero above is exact rather than merely safe. The same
    // roster and census, with nothing `unique` for the old count to have
    // refused: `rosterRowIsDrawable` is never even reached, because
    // `rulesAllow` turns every row away, so the stage ends without a person and
    // the census walks no pair.
    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            age: { name: 'Age', type: 'number', validation: { minValue: 18 } },
          },
        },
      },
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
          variables: { strength: { name: 'Strength', type: 'boolean' } },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

    const drawn = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [rosterStage(), census],
        externalData: underage,
      });
      drawn.add(`${network.nodes.length}/${network.edges.length}`);
    }

    expect([...drawn]).toEqual(['0/0']);
  });

  it('leaves a fabricating stage’s panel rows alone', () => {
    // A NameGenerator given a panel fabricates the rest of its people, so its
    // ceiling is its own whatever the panel holds — and its prompt, not its
    // row, wins a collision. Nothing about its rows is read here.
    const counts = worstCaseEntityCounts(
      [nameGenerator({ behaviours: { maxNodes: 4 } })],
      config,
      { 'stage-1': [valuedRow('a', { age: 5 }), valuedRow('b', { age: 6 })] },
      adult,
    );

    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(4);
  });
});

describe('generateNetwork with a roster-capped unique variable', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          consented: {
            name: 'Consented',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates nothing, rather than refusing, for a known-empty roster', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [rosterStage()],
      externalData: { 'stage-roster': [] },
    });

    expect(network.nodes).toHaveLength(0);
  });

  it('generates the drawable rows when a roster repeats a unique value', () => {
    // Three rows, two values between them: the draw passes the repeat over and
    // adds the two people it can. Counting the pool's length instead refused
    // this protocol for needing three distinct booleans it never asks for.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [rosterStage()],
      externalData: {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: false }),
          valuedRow('c', { consented: true }),
        ],
      },
    });

    expect(network.nodes).toHaveLength(2);
  });

  it('still refuses when the rows really do exhaust the value space', () => {
    // The third row carries no `consented`, so the draw is asked for one — and
    // both booleans are already on the other two rows. Nothing is passed over
    // here, so an analysis that let this through would only move the refusal to
    // the draw, on whichever seeds reached the third person.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [rosterStage()],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: false }),
            rosterRow('c'),
          ],
        },
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 3 nodes of this type can be generated/);
  });

  it('still refuses when a fabricating stage needs what the roster left', () => {
    // The roster spends both booleans between its two distinct values, and the
    // name generator's person then has none left to be told apart by.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          rosterStage(),
          nameGenerator({ id: 'ng', behaviours: { minNodes: 1, maxNodes: 1 } }),
        ],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: false }),
            valuedRow('c', { consented: true }),
          ],
        },
      }),
    ).toThrow(/up to 3 nodes of this type can be generated/);
  });

  it('still refuses when the roster cannot be resolved', () => {
    // Nothing is known about the roster, so the stage fabricates three people
    // and two boolean values cannot tell them apart. Refusing up front is the
    // only alternative to throwing partway through the draw.
    expect(() =>
      generateNetwork({ seed: 1, codebook, stages: [rosterStage()] }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

describe('generateNetwork with a filtered writer on existing nodes', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          band: {
            name: 'Band',
            type: 'ordinal',
            options: Array.from({ length: 10 }, (_, index) => ({
              label: `Band ${String(index + 1)}`,
              value: index + 1,
            })),
            validation: { unique: true },
          },
          selected: {
            name: 'Selected',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  const stages = [
    nameGenerator({
      form: { fields: [{ variable: 'band', prompt: 'Band?' }] },
      behaviours: { minNodes: 10, maxNodes: 10 },
    }),
    filteredNodeAlterForm('band', 'selected'),
  ];

  it('does not promote a filtered write to every earlier node', () => {
    const counts = worstCaseEntityCounts(
      stages,
      config,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(nodeCountFor(counts.node, 'person', ['selected'])).toBe(0);
  });

  it('generates when the filter reaches one holder of a unique boolean', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(10);
    expect(
      network.nodes.filter(
        (node) => node[entityAttributesProperty].selected !== undefined,
      ),
    ).toHaveLength(1);
  });
});

describe('generateNetwork with a unique group a roster populates unevenly', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: {
          consented: {
            name: 'Consented',
            type: 'boolean',
            validation: { unique: true },
          },
          mirror: {
            name: 'Mirror',
            type: 'boolean',
            validation: { sameAs: 'consented' },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates the one person three rows repeating a value can build', () => {
    // Reading `mirror` on its own counted three people against a two-value
    // space and refused this protocol. The rows share the group's `unique`
    // slot, so the draw takes the first and passes the other two over.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [rosterStage()],
      externalData: {
        'stage-roster': [
          valuedRow('a', { consented: true }),
          valuedRow('b', { consented: true }),
          valuedRow('c', { consented: true }),
        ],
      },
    });

    expect(network.nodes).toHaveLength(1);
    expect(network.nodes[0]?.[entityAttributesProperty]).toEqual({
      consented: true,
      mirror: true,
    });
  });

  it('still refuses when the rows really do exhaust the group', () => {
    // Two rows spend both booleans between them, and the third carries neither
    // member — so the draw is asked for a group value it has nothing left to
    // issue. Under-counting here would move this refusal into the draw.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [rosterStage()],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: false }),
            rosterRow('c'),
          ],
        },
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('still refuses when a fabricating stage needs what the rows left', () => {
    // The roster's rows spend `true`, and the two people the name generator
    // fabricates have one boolean left to be told apart by.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          rosterStage(),
          nameGenerator({ id: 'ng', behaviours: { minNodes: 2, maxNodes: 2 } }),
        ],
        externalData: {
          'stage-roster': [
            valuedRow('a', { consented: true }),
            valuedRow('b', { consented: true }),
            valuedRow('c', { consented: true }),
          ],
        },
      }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

describe('generateNetwork with a unique variable on a composer edge type', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'Strength',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates when the composer own people cannot exhaust the value space', () => {
    // Two people the composer builds itself reach one pair, whatever the five
    // the name generator added before it hold. Reading the protocol-wide total
    // refused this for needing 21 distinct booleans it never asks for.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [
        nameGenerator({ behaviours: { minNodes: 5, maxNodes: 5 } }),
        networkComposer(),
      ],
      config: { nodeCount: { min: 2, max: 2 } },
    });

    expect(network.nodes).toHaveLength(7);
    expect(network.edges.length).toBeLessThanOrEqual(1);
  });

  it('still refuses when the composer own people do exhaust it', () => {
    // Four people pair six ways and two booleans cannot tell six edges apart,
    // so this has to refuse up front rather than run out partway through the
    // composer's own pass.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [networkComposer()],
        config: { nodeCount: { min: 4, max: 4 } },
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 6 edges of this type can be generated/);
  });

  it('still refuses when a later census pairs everyone the composer added', () => {
    // The census reads the whole draft, composer people included, so the count
    // that matters there is the protocol-wide one — C(3, 2) = 3 rather than the
    // composer's own single pass. The composer's edges are inside that number
    // rather than added to it, since the census meets them on the pairs it
    // walks and reuses them.
    const census = {
      id: 'stage-census',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      ],
    } as unknown as Stage;

    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [networkComposer(), census],
        config: { nodeCount: { min: 3, max: 3 } },
      }),
    ).toThrow(/up to 3 edges of this type can be generated/);
  });
});

describe('generateNetwork with a filtered pair-edge stage', () => {
  const person = {
    name: 'Person',
    color: 'node-color-seq-1',
    variables: {
      band: {
        name: 'Band',
        type: 'ordinal',
        options: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
          { label: 'C', value: 3 },
        ],
        validation: { unique: true },
      },
    },
  };

  const filteredCensus = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    filter: {
      rules: [
        {
          id: 'r1',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'band',
            operator: 'EXACTLY',
            value: 1,
          },
        },
      ],
    },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const stages = [
    nameGenerator({ behaviours: { minNodes: 3, maxNodes: 3 } }),
    filteredCensus,
  ];

  it('creates no edges at all when the filter admits one node', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook: {
        node: { person },
        edge: {
          knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
        },
      } as unknown as Parameters<typeof generateNetwork>[0]['codebook'],
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
    expect(network.edges).toHaveLength(0);
  });

  it('refuses it anyway, counting the pairs the filter is not read to exclude', () => {
    // A deliberate over-count, and the one the count above proves is wide: this
    // stage creates no edges at all, yet three pairs are counted against the
    // two booleans and the protocol is refused.
    //
    // Kept because no bound tighter than this is sound. Whether a node passes a
    // filter depends on values the analysis has not drawn, so the filtered set
    // is genuinely unknown here; the narrowing this case invites — "the
    // attribute is `unique`, so one node can hold the value the rule names" —
    // reads the conclusion of the very check being run, and would silently
    // become an under-count the moment the `unique` check gains an exemption
    // (as it has twice already, for roster rows and for bin-assigned
    // variables). Deferring the capacity check to the draw instead is the same
    // under-count by another route: the protocol would pass analysis and refuse
    // partway through, on whichever seeds reached it.
    //
    // An over-count costs a refusal that should not stand. An under-count costs
    // a run that throws mid-draw, which this whole pass exists to prevent.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: {
          node: { person },
          edge: {
            knows: {
              name: 'Knows',
              color: 'edge-color-seq-1',
              variables: {
                strength: {
                  name: 'Strength',
                  type: 'boolean',
                  validation: { unique: true },
                },
              },
            },
          },
        } as unknown as Parameters<typeof generateNetwork>[0]['codebook'],
        stages,
        respectSkipLogicAndFiltering: true,
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 3 edges of this type can be generated/);
  });
});

describe('generateNetwork with a unique variable on a pedigree edge type', () => {
  const codebook = {
    node: {
      relative: {
        name: 'Relative',
        color: 'node-color-seq-1',
        variables: {},
      },
    },
    edge: {
      kin: {
        name: 'Kin',
        color: 'edge-color-seq-1',
        variables: {
          verified: {
            name: 'Verified',
            type: 'boolean',
            validation: { unique: true },
          },
          note: { name: 'Note', type: 'text' },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('generates, rather than refusing, when nothing fills the pedigree edges', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [familyPedigree()],
    });

    expect(network.edges.length).toBeGreaterThan(2);
    // The premise the count now rests on: these edges hold no value at all, so
    // no two of them can hold the same one.
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].verified === undefined,
      ),
    ).toBe(true);
  });

  it('still refuses up front when a form on the same edge type fills that variable', () => {
    // The form writes every existing edge of the type, pedigree-built ones
    // included, and renders a field that validates what it wrote — so nine
    // edges really do have to hold nine distinct booleans.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [familyPedigree(), alterEdgeForm('verified')],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    // Named specifically, because an exemption that let these edges out of the
    // count would not make this protocol generate — it would only move the
    // refusal to the draw, where the form runs out of booleans partway through
    // and the message says nothing about how many edges there were.
    expect(generate).toThrow(/up to 96 edges of this type can be generated/);
  });

  it('generates when the form on that edge type fills a different variable', () => {
    // `handleAlterEdgeForm` writes only the variables its form renders, so
    // `verified` stays undefined on all pedigree edges however many of them the
    // form touches.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [familyPedigree(), alterEdgeForm('note')],
    });

    expect(network.edges.length).toBeGreaterThan(2);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].verified === undefined,
      ),
    ).toBe(true);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].note !== undefined,
      ),
    ).toBe(true);
  });

  it('generates when a filter tests the unique variable the form does not fill', () => {
    // Pedigree edges and a `unique` boolean the form never renders.
    // Counting the filter's reference as a naming site would demand nine
    // distinct booleans of edges that hold none.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [familyPedigree(), filteredAlterEdgeForm('verified', 'note')],
    });

    expect(network.edges.length).toBeGreaterThan(2);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].verified === undefined,
      ),
    ).toBe(true);
  });

  it('still refuses when the form both filters on and renders that variable', () => {
    // The guard on the exemption above: a filter cannot excuse a variable the
    // same form writes to every pedigree edge.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          familyPedigree(),
          filteredAlterEdgeForm('verified', 'verified'),
        ],
      }),
    ).toThrow(/up to 96 edges of this type can be generated/);
  });

  it('still refuses when the form fills a variable held equal to the unique one', () => {
    // The group holds one value, so what any member of it spends the whole
    // group spends: every edge carries `mirror`, so distinct values are
    // needed however few of them carry `verified` itself.
    const heldEqual = {
      node: { relative: { name: 'Relative', color: 'nc-1', variables: {} } },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: {
            verified: {
              name: 'Verified',
              type: 'boolean',
              validation: { unique: true },
            },
            mirror: {
              name: 'Mirror',
              type: 'boolean',
              validation: { sameAs: 'verified' },
            },
          },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: heldEqual,
        stages: [familyPedigree(), alterEdgeForm('mirror')],
      }),
    ).toThrow(/up to 96 edges of this type can be generated/);
  });

  it('still refuses when another stage creates edges of the same type', () => {
    // A Sociogram generates the whole attribute set of every edge it creates,
    // so those edges hold `verified` whatever the form renders. Only the
    // pedigree's own edges are ever exempted.
    const sociogram = {
      id: 'stage-sociogram',
      type: 'Sociogram',
      label: 'Link them',
      subject: { entity: 'node', type: 'relative' },
      prompts: [{ id: 'p1', text: 'Who knows who?', edges: { create: 'kin' } }],
    } as unknown as Stage;

    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [familyPedigree(), sociogram, alterEdgeForm('note')],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });
});

/**
 * A pair set covers only the people standing when its stage runs, and a form
 * fills only the edges standing when its stage runs. These pin both readings,
 * in each direction: the protocol a stage-order-blind count refused, and the
 * one that has to keep being refused because the order really does put the
 * entities within reach.
 */
describe('generateNetwork with stage order deciding what a stage can reach', () => {
  const person = {
    name: 'Person',
    color: 'node-color-seq-1',
    variables: { name: { name: 'Name', type: 'text' } },
  };

  const uniqueBooleanEdge = {
    node: { person },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'Strength',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const twoPeople = nameGenerator({
    id: 'ng-two',
    behaviours: { minNodes: 2, maxNodes: 2 },
  });
  const eightPeople = nameGenerator({
    id: 'ng-eight',
    behaviours: { minNodes: 8, maxNodes: 8 },
  });

  it('counts a census over the people who exist when it runs', () => {
    const counts = worstCaseEntityCounts(
      [twoPeople, census, eightPeople],
      config,
    );
    // C(2, 2) = 1, not the C(10, 2) = 45 the protocol's final tally reaches.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(1);
  });

  it('generates when a later name generator cannot reach an earlier census', () => {
    // The eight people the third stage adds are never among the census's
    // candidates, so one pair is all it can join and two booleans cover it.
    // Reading the protocol-wide total refused this for needing 45.
    const { network } = generateNetwork({
      seed: 1,
      codebook: uniqueBooleanEdge,
      stages: [twoPeople, census, eightPeople],
    });

    expect(network.nodes).toHaveLength(10);
    expect(network.edges.length).toBeLessThanOrEqual(1);
  });

  it('still refuses when those people are added before the census', () => {
    // The same three stages, reordered so the census does see all ten. Nothing
    // about the count is blanket-narrowed: the pair set is genuinely 45 here.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: uniqueBooleanEdge,
        stages: [twoPeople, eightPeople, census],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 45 edges of this type can be generated/);
  });

  it('still refuses when the census own people exhaust the value space', () => {
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: uniqueBooleanEdge,
        stages: [
          nameGenerator({ behaviours: { minNodes: 3, maxNodes: 3 } }),
          census,
        ],
      });

    expect(generate).toThrow(/up to 3 edges of this type can be generated/);
  });

  it('keeps a composer pairing its own people when the census ran first', () => {
    // The composer builds its people after the census has walked an empty
    // draft, so its pair is outside the census's pair set rather than inside
    // it. Folding it in on stage existence alone would report nothing at all
    // for an edge the composer really does create.
    const counts = worstCaseEntityCounts([census, networkComposer()], config);
    // C(8, 2) = 28 over the composer's own configured ceiling.
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(28);
  });
});

/**
 * A FamilyPedigree edge is born empty and stays empty unless something writes
 * onto an edge it did not create — and a writer can only reach the edges that
 * exist when it runs.
 */
describe('generateNetwork with a pedigree built after its edge form', () => {
  const codebook = {
    node: {
      relative: { name: 'Relative', color: 'node-color-seq-1', variables: {} },
    },
    edge: {
      kin: {
        name: 'Kin',
        color: 'edge-color-seq-1',
        variables: {
          verified: {
            name: 'Verified',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('counts no pedigree edge for a variable only an earlier stage names', () => {
    const counts = worstCaseEntityCounts(
      [alterEdgeForm('verified'), familyPedigree()],
      config,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(0);
  });

  it('generates, rather than refusing, when the form runs before the pedigree', () => {
    // `handleAlterEdgeForm` walks the edges on the draft when it runs, and
    // there are none: the pedigree has not been reached yet. Its edges are
    // then created empty and nothing ever fills them.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [alterEdgeForm('verified'), familyPedigree()],
    });

    expect(network.edges.length).toBeGreaterThan(2);
    expect(
      network.edges.every(
        (edge) => edge[entityAttributesProperty].verified === undefined,
      ),
    ).toBe(true);
  });

  it('still refuses for the pedigree the form can reach', () => {
    // Two pedigrees straddling the form. The first one's edges exist by the
    // time the form runs and really do have to hold nine distinct booleans; the
    // second one's do not exist yet. Counting per pedigree rather than per
    // protocol is what tells them apart.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook,
        stages: [
          familyPedigree(),
          alterEdgeForm('verified'),
          familyPedigree({ id: 'stage-fp-late' }),
        ],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 96 edges of this type can be generated/);
  });
});

/**
 * A configured per-pair probability that cannot rise above zero leaves
 * `createEdgesForPairs` unable to create anything, however many pairs it walks.
 */
describe('generateNetwork with a census configured to create no edges', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          strength: {
            name: 'Strength',
            type: 'boolean',
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const stages = [
    nameGenerator({ behaviours: { minNodes: 3, maxNodes: 3 } }),
    census,
  ];

  it('counts no pair for a census whose probability ceiling is zero', () => {
    const never = resolveGenerationConfig({
      today: '2026-07-27',
      censusEdgeProbability: { min: 0, max: 0 },
    });

    const counts = worstCaseEntityCounts(stages, never);
    expect(edgeCountFor(counts.edge, 'knows', ['strength'])).toBe(0);
  });

  it('generates, rather than refusing, and creates the nothing it counted', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages,
      config: { censusEdgeProbability: { min: 0, max: 0 } },
    });

    expect(network.nodes).toHaveLength(3);
    expect(network.edges).toHaveLength(0);
  });

  it('still refuses when the ceiling is above zero at all', () => {
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages,
        config: { censusEdgeProbability: { min: 0, max: 0.001 } },
      }),
    ).toThrow(/up to 3 edges of this type can be generated/);
  });

  it('still refuses for an inverted range whose larger end is above zero', () => {
    // `randomFloat` is handed the range as written, so a `max` of zero says
    // nothing on its own: reading it alone would call this stage edgeless and
    // let a protocol through that draws at up to a half per pair.
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook,
        stages,
        config: { censusEdgeProbability: { min: 0.5, max: 0 } },
      }),
    ).toThrow(/up to 3 edges of this type can be generated/);
  });

  it('keeps counting the edges a zero-probability census only writes onto', () => {
    // `handleTieStrengthCensus` fills its `edgeVariable` over reused edges as
    // well as new ones, so a census that creates nothing still puts a value on
    // every pedigree edge it meets. Those edges are counted where they were
    // created, and dropping the census's own pairs must not drop them too.
    const tieStrength = {
      id: 'stage-tie',
      type: 'TieStrengthCensus',
      label: 'How close?',
      subject: { entity: 'node', type: 'relative' },
      prompts: [
        {
          id: 'p1',
          text: 'How close are they?',
          createEdge: 'kin',
          edgeVariable: 'closeness',
          negativeLabel: 'Not at all',
        },
      ],
    } as unknown as Stage;

    const never = resolveGenerationConfig({
      today: '2026-07-27',
      censusEdgeProbability: { min: 0, max: 0 },
    });

    const counts = worstCaseEntityCounts(
      [familyPedigree(), tieStrength],
      never,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['closeness'])).toBe(
      pedigreeEdgeCeiling(never),
    );
  });
});

/**
 * The interview reuses the pair's edge when two prompts name one edge type —
 * `edgeExists({ from, to, type })` on the shared graph — and the generator now
 * does the same: `createEdgesForPairs` looks the pair up on `draft.edges`
 * before drawing, so a second prompt over the same people leaves the first
 * prompt's edge alone. These pin that, and the count in `worstCaseEntityCounts`
 * that follows from it: one pair set per node type, not one per prompt.
 */
describe('generateNetwork with two prompts sharing one edge type', () => {
  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          band: {
            name: 'Band',
            type: 'ordinal',
            options: [1, 2, 3, 4, 5, 6].map((value) => ({
              label: `Band ${value}`,
              value,
            })),
            validation: { unique: true },
          },
        },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  const census = {
    id: 'stage-census',
    type: 'DyadCensus',
    label: 'Census',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
      { id: 'p2', text: 'Are they close?', createEdge: 'knows' },
    ],
  } as unknown as Stage;

  const threePeople = nameGenerator({
    behaviours: { minNodes: 3, maxNodes: 3 },
  });

  function bandsOf(
    optionCount: number,
  ): Parameters<typeof generateNetwork>[0]['codebook'] {
    return {
      ...codebook,
      edge: {
        knows: {
          name: 'Knows',
          color: 'edge-color-seq-1',
          variables: {
            band: {
              name: 'Band',
              type: 'ordinal',
              options: Array.from({ length: optionCount }, (_value, at) => ({
                label: `Band ${at + 1}`,
                value: at + 1,
              })),
              validation: { unique: true },
            },
          },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];
  }

  it('creates one edge per pair, whichever prompt reached it first', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [threePeople, census],
      config: { censusEdgeProbability: { min: 1, max: 1 } },
    });

    const knows = network.edges.filter((edge) => edge.type === 'knows');
    const bands = knows.map((edge) => edge[entityAttributesProperty].band);

    // C(3, 2) = 3 pairs, answered twice over and joined once.
    expect(knows).toHaveLength(3);
    expect(new Set(bands).size).toBe(3);
  });

  it('records the second prompt as answered without drawing a second edge', () => {
    // The runtime pre-selects 'Yes' for a pair a sibling prompt already
    // connected and records that answer per prompt, so both prompts read as
    // answered for all three pairs while one edge joins each of them.
    const { stageMetadata } = generateNetwork({
      seed: 3,
      codebook,
      stages: [threePeople, census],
      config: { censusEdgeProbability: { min: 1, max: 1 } },
    });

    const meta = stageMetadata?.[1] as [number, string, string, boolean][];
    expect(meta).toHaveLength(6);
    expect(meta.every(([, , , answer]) => answer)).toBe(true);
    expect(new Set(meta.map(([promptIndex]) => promptIndex))).toEqual(
      new Set([0, 1]),
    );
  });

  it('accepts a value space covering the pairs once', () => {
    // Three values for the three edges the two prompts share between them.
    // Counting a pair set per prompt would refuse this for needing six.
    const { network } = generateNetwork({
      seed: 3,
      codebook: bandsOf(3),
      stages: [threePeople, census],
      config: { censusEdgeProbability: { min: 1, max: 1 } },
    });

    expect(network.edges.filter((edge) => edge.type === 'knows')).toHaveLength(
      3,
    );
  });

  it('refuses a value space that cannot cover the pairs even once', () => {
    expect(() =>
      generateNetwork({
        seed: 3,
        codebook: bandsOf(2),
        stages: [threePeople, census],
        config: { censusEdgeProbability: { min: 1, max: 1 } },
      }),
    ).toThrow(/up to 3 edges of this type can be generated/);
  });
});

/** A FamilyPedigree may write every semantic named by its edge config. */
describe('worstCaseEntityCounts with a fully configured pedigree edge', () => {
  const edgeConfig = {
    type: 'kin',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'verified',
    isGestationalCarrierVariable: 'carrier',
    gameteRoleVariable: 'gamete',
  };

  const configuredPedigree = familyPedigree({ edgeConfig });

  /** A `unique` boolean on whichever edge variable the test is about. */
  const uniqueBooleanOn = (
    variableId: string,
  ): Parameters<typeof generateNetwork>[0]['codebook'] =>
    ({
      node: {
        relative: {
          name: 'Relative',
          color: 'node-color-seq-1',
          variables: {},
        },
      },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: {
            [variableId]: {
              name: 'Verified',
              type: 'boolean',
              validation: { unique: true },
            },
          },
        },
      },
    }) as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  it('counts its conservative edge ceiling for every semantic it may write', () => {
    const counts = worstCaseEntityCounts([configuredPedigree], config);
    const ceiling = pedigreeEdgeCeiling(config);
    expect(edgeCountFor(counts.edge, 'kin', ['relationshipType'])).toBe(
      ceiling,
    );
    expect(edgeCountFor(counts.edge, 'kin', ['verified'])).toBe(ceiling);
    expect(edgeCountFor(counts.edge, 'kin', ['carrier'])).toBe(ceiling);
    expect(edgeCountFor(counts.edge, 'kin', ['gamete'])).toBe(ceiling);
  });

  it('refuses a unique carrier flag because biological edges repeat true', () => {
    expect(() =>
      generateNetwork({
        seed: 1,
        codebook: uniqueBooleanOn('carrier'),
        stages: [configuredPedigree],
      }),
    ).toThrow(SyntheticDataConstraintError);
  });

  it('refuses for a unique variable it writes onto every edge itself', () => {
    // The other half of the same carve-out: the pedigree really does put its
    // active flag on every edge, so a `unique` boolean there has multiple
    // holders and two values, and no seed can satisfy it.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: uniqueBooleanOn('verified'),
        stages: [configuredPedigree],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 96 edges of this type can be generated/);
  });

  it('refuses a unique relationship type it writes on every edge', () => {
    // Multiple edges hold values selected from the relationship-type space.
    // Counting holders alone can accept a semantically forced duplicate, so the
    // refusal has to come from counting what the pedigree fixes, the same way
    // its ego flag is counted.
    const codebook = {
      node: {
        relative: {
          name: 'Relative',
          color: 'node-color-seq-1',
          variables: {},
        },
      },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: {
            relationshipType: {
              name: 'Relationship',
              type: 'categorical',
              options: RELATIONSHIP_TYPE_OPTIONS,
              validation: { unique: true },
            },
            carrier: { name: 'Carrier', type: 'boolean' },
          },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

    const generate = (): unknown =>
      generateNetwork({ seed: 1, codebook, stages: [configuredPedigree] });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(
      /a family pedigree fixes this to .* but unique allows one edge to hold a value/,
    );
  });

  it('still refuses for a pedigree whose edges a later form does fill', () => {
    // The ordering that decides which pedigrees a writer reaches is untouched:
    // a form naming an unwritten variable after the first pedigree really does
    // put a value on all of its edges, while the second pedigree runs
    // after the form and leaves that variable undefined on its own.
    const generate = (): unknown =>
      generateNetwork({
        seed: 1,
        codebook: uniqueBooleanOn('carrier'),
        stages: [
          configuredPedigree,
          alterEdgeForm('carrier'),
          familyPedigree({ id: 'stage-fp-late', edgeConfig }),
        ],
      });

    expect(generate).toThrow(SyntheticDataConstraintError);
    expect(generate).toThrow(/up to 192 edges of this type can be generated/);
  });

  /**
   * A pedigree's written edge value is the last word on its variable only while
   * nothing runs after it that redraws the same variable on the same edges.
   * `handleAlterEdgeForm` regenerates every field it renders over every
   * existing edge of its type, so a form after the pedigree replaces the
   * literal on all of them — and what those edges finish holding is drawn
   * against the variable's rules like any other value.
   */
  describe('whose written value a later form redraws', () => {
    const uniqueRelationshipType = {
      node: {
        relative: {
          name: 'Relative',
          color: 'node-color-seq-1',
          variables: {},
        },
      },
      edge: {
        kin: {
          name: 'Kin',
          color: 'edge-color-seq-1',
          variables: {
            relationshipType: {
              name: 'Relationship',
              type: 'categorical',
              options: [
                ...RELATIONSHIP_TYPE_OPTIONS,
                ...Array.from({ length: 30 }, (_, index) => ({
                  value: `synthetic-${String(index)}`,
                  label: `Synthetic ${String(index)}`,
                })),
              ],
              validation: { unique: true },
            },
          },
        },
      },
    } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

    const compactPedigree = { familyPedigreeNodeCount: { min: 7, max: 7 } };

    it('accepts it, and draws the distinct values the form has room for', () => {
      for (let seed = 1; seed <= 25; seed++) {
        const { network } = generateNetwork({
          seed,
          codebook: uniqueRelationshipType,
          stages: [
            familyPedigree({ edgeConfig }),
            alterEdgeForm('relationshipType'),
          ],
          config: compactPedigree,
        });

        const values = network.edges.map(
          (edge) => edge[entityAttributesProperty].relationshipType,
        );

        expect(values.length, `seed ${seed}`).toBe(network.edges.length);
        expect(
          new Set(values.map((value) => JSON.stringify(value))).size,
          `seed ${seed}`,
        ).toBe(values.length);
      }
    });

    it('retains the fixed values where a respected filter excludes the pedigree edges', () => {
      const generate = (): unknown =>
        generateNetwork({
          seed: 1,
          codebook: uniqueRelationshipType,
          stages: [
            familyPedigree({ edgeConfig }),
            filteredAlterEdgeForm('carrier', 'relationshipType'),
          ],
          respectSkipLogicAndFiltering: true,
          config: compactPedigree,
        });

      expect(generate).toThrow(SyntheticDataConstraintError);
      expect(generate).toThrow(
        /a family pedigree fixes this to .* but unique allows one edge to hold a value/,
      );
    });

    it('still redraws every edge when filtering is disabled', () => {
      const { network } = generateNetwork({
        seed: 1,
        codebook: uniqueRelationshipType,
        stages: [
          familyPedigree({ edgeConfig }),
          filteredAlterEdgeForm('carrier', 'relationshipType'),
        ],
        config: compactPedigree,
      });

      const values = network.edges.map(
        (edge) => edge[entityAttributesProperty].relationshipType,
      );
      expect(values).toHaveLength(network.edges.length);
      expect(new Set(values.map((value) => JSON.stringify(value))).size).toBe(
        values.length,
      );
    });

    it('still refuses where the form runs before the pedigree', () => {
      // Edges created after a form never meet it, so the pins stand: both of
      // them hold the literal the pedigree wrote.
      const generate = (): unknown =>
        generateNetwork({
          seed: 1,
          codebook: uniqueRelationshipType,
          stages: [
            alterEdgeForm('relationshipType'),
            familyPedigree({ edgeConfig }),
          ],
          config: compactPedigree,
        });

      expect(generate).toThrow(SyntheticDataConstraintError);
      expect(generate).toThrow(
        /a family pedigree fixes this to .* but unique allows one edge to hold a value/,
      );
    });

    it('still refuses where the later form renders a different variable', () => {
      const generate = (): unknown =>
        generateNetwork({
          seed: 1,
          codebook: uniqueRelationshipType,
          stages: [familyPedigree({ edgeConfig }), alterEdgeForm('carrier')],
          config: compactPedigree,
        });

      expect(generate).toThrow(SyntheticDataConstraintError);
      expect(generate).toThrow(
        /a family pedigree fixes this to .* but unique allows one edge to hold a value/,
      );
    });
  });
});

/**
 * Roster rows are drawn without replacement across the whole run — one shared
 * `usedRosterUids` set, whatever node type a stage builds — so a stage can be
 * left with fewer rows than its pool holds. These pin why the tallies still
 * keep roster keys inside each node type rather than assigning each key to the
 * first stage offering it: an earlier stage is not guaranteed to draw anything,
 * so a later type really can reach every shared row.
 */
describe('worstCaseEntityCounts with roster rows shared across node types', () => {
  const sharedRows = ['a', 'b', 'c'].map(rosterRow);

  function orgRoster(overrides: Record<string, unknown> = {}): Stage {
    return rosterStage({
      id: 'roster-org',
      subject: { entity: 'node', type: 'organization' },
      behaviours: { minNodes: 3, maxNodes: 3 },
      ...overrides,
    });
  }

  const codebook = {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables: { name: { name: 'Name', type: 'text' } },
      },
      organization: {
        name: 'Organization',
        color: 'node-color-seq-2',
        variables: { flag: { name: 'Flag', type: 'boolean' } },
      },
    },
  } as unknown as Parameters<typeof generateNetwork>[0]['codebook'];

  const externalData = {
    'roster-person': sharedRows,
    'roster-org': sharedRows,
  };

  it('counts every shared row for a later node type', () => {
    const counts = worstCaseEntityCounts(
      [
        rosterStage({
          id: 'roster-person',
          behaviours: { minNodes: 0, maxNodes: 3 },
        }),
        orgRoster(),
      ],
      config,
      externalData,
    );

    expect(nodeCountFor(counts.node, 'organization', ['flag'])).toBe(3);
  });

  it('draws every shared row as organizations on some seed', () => {
    // The proof the count above is not merely safe but reachable: the person
    // stage may draw none of the three rows, and then all three build
    // organizations. Assigning each key to the first stage offering it would
    // count nothing for this type and let a `unique` variable through that runs
    // out of values partway through this very draw.
    const drawn = new Set<number>();
    for (let seed = 1; seed <= 50; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [
          rosterStage({
            id: 'roster-person',
            behaviours: { minNodes: 0, maxNodes: 3 },
          }),
          orgRoster(),
        ],
        externalData,
      });
      drawn.add(
        network.nodes.filter((node) => node.type === 'organization').length,
      );
    }

    expect(Math.max(...drawn)).toBe(3);
  });
});
