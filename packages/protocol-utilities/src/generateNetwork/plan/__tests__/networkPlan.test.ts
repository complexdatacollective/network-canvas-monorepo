import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { ValueGenerator } from '../../../ValueGenerator';
import { analyseStageEffects } from '../../analyse/stageEffects';
import { resolveGenerationConfig } from '../../config';
import { buildEntityConstraints } from '../../constraints/buildConstraints';
import { UniqueRegistry } from '../../constraints/uniqueRegistry';
import type { GenerationContext } from '../../context';
import { apportionCount, planNetwork } from '../networkPlan';

const TODAY = '2026-08-06';

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const nameGenerator = (overrides: Record<string, unknown> = {}): Stage =>
  stage({
    id: 'ng-1',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'p1', text: 'Who?' }],
    ...overrides,
  });

/**
 * A form pass over every person, writing the variables named.
 *
 * The plan draws only what some stage writes — a variable no interaction ever
 * asks about stays unanswered — so a test reading a drawn value has to give it
 * a writer.
 */
const alterForm = (...variables: string[]): Stage =>
  stage({
    id: 'form-1',
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    form: { fields: variables.map((variable) => ({ variable, prompt: '?' })) },
  });

const baseCodebook = (
  personSynthetic?: Record<string, unknown>,
  extras: Record<string, unknown> = {},
): StructuralCodebook =>
  ({
    node: {
      person: {
        name: 'Person',
        variables: {
          name: { name: 'Name', type: 'text' },
          age: {
            name: 'Age',
            type: 'number',
            synthetic: { distribution: 'normal', mean: 34, sd: 12 },
          },
          ...extras,
        },
        ...(personSynthetic ? { synthetic: personSynthetic } : {}),
      },
    },
    edge: {},
    ego: { variables: {} },
  }) as unknown as StructuralCodebook;

function makeCtx(
  codebook: StructuralCodebook,
  options: {
    seed?: number;
    externalData?: Record<string, NcNode[]>;
    respectSkipLogicAndFiltering?: boolean;
  } = {},
): GenerationContext {
  const config = resolveGenerationConfig({ today: TODAY });
  return {
    codebook,
    valueGen: new ValueGenerator(options.seed ?? 42, TODAY),
    config,
    usedRosterUids: new Set<string>(),
    externalData: options.externalData,
    respectSkipLogicAndFiltering: options.respectSkipLogicAndFiltering ?? false,
    uniqueRegistry: new UniqueRegistry(),
    entityConstraints: {
      ego: buildEntityConstraints(codebook.ego?.variables, TODAY),
      node: new Map(
        Object.entries(codebook.node ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
      edge: new Map(
        Object.entries(codebook.edge ?? {}).map(([type, definition]) => [
          type,
          buildEntityConstraints(definition.variables, TODAY),
        ]),
      ),
    },
  };
}

const plan = (
  codebook: StructuralCodebook,
  stages: Stage[],
  options?: Parameters<typeof makeCtx>[1],
) => planNetwork(makeCtx(codebook, options), analyseStageEffects(stages));

describe('apportionCount', () => {
  it('honours minimums before distributing the remainder', () => {
    expect(
      apportionCount(10, [
        { min: 2, max: null },
        { min: 3, max: null },
      ]),
    ).toEqual([5, 5]);
  });

  it('raises the total to the sum of minimums', () => {
    expect(
      apportionCount(1, [
        { min: 2, max: null },
        { min: 3, max: null },
      ]),
    ).toEqual([2, 3]);
  });

  it('truncates at capacity when every ceiling binds', () => {
    expect(
      apportionCount(10, [
        { min: 0, max: 2 },
        { min: 1, max: 3 },
      ]),
    ).toEqual([2, 3]);
  });
});

describe('planNetwork populations', () => {
  it('draws the declared constant population', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 5 } }),
      [nameGenerator(), alterForm('age')],
    );
    expect(result.nodes).toHaveLength(5);
    for (const node of result.nodes) {
      expect(node.creationStageIndex).toBe(0);
      expect(node.type).toBe('person');
      expect(typeof node.attributes.name).toBe('string');
      expect(typeof node.attributes.age).toBe('number');
    }
  });

  it('caps the population at stage capacity', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 10 } }),
      [nameGenerator({ behaviours: { maxNodes: 3 } })],
    );
    expect(result.nodes).toHaveLength(3);
  });

  it('raises the population to a stage minimum', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 0 } }),
      [nameGenerator({ behaviours: { minNodes: 2 } })],
    );
    expect(result.nodes).toHaveLength(2);
  });

  it('plans nobody for a type no stage creates', () => {
    const result = plan(baseCodebook(), []);
    expect(result.nodes).toHaveLength(0);
  });

  it('spreads a population across creating stages', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 6 } }),
      [nameGenerator(), nameGenerator({ id: 'ng-2' })],
    );
    const byStage = new Map<number, number>();
    for (const node of result.nodes) {
      byStage.set(
        node.creationStageIndex,
        (byStage.get(node.creationStageIndex) ?? 0) + 1,
      );
    }
    expect(byStage.get(0)).toBe(3);
    expect(byStage.get(1)).toBe(3);
  });

  it('applies prompt additionalAttributes as fixed values', () => {
    const result = plan(
      baseCodebook(
        { count: { distribution: 'constant', value: 4 } },
        {
          close: { name: 'Close', type: 'boolean' },
        },
      ),
      [
        nameGenerator({
          prompts: [
            {
              id: 'p1',
              text: 'Close?',
              additionalAttributes: [{ variable: 'close', value: true }],
            },
            { id: 'p2', text: 'Others?' },
          ],
        }),
      ],
    );
    const byPrompt = new Map<number, boolean[]>();
    for (const node of result.nodes) {
      const list = byPrompt.get(node.promptIndex) ?? [];
      list.push(node.attributes.close as boolean);
      byPrompt.set(node.promptIndex, list);
    }
    expect(byPrompt.get(0)).toEqual([true, true]);
  });
});

describe('planNetwork rosters', () => {
  const rosterStage = stage({
    id: 'roster-1',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    dataSource: 'people.csv',
    prompts: [{ id: 'p1', text: 'Pick' }],
  });

  const row = (uid: string, name: string): NcNode =>
    ({
      [entityPrimaryKeyProperty]: uid,
      type: 'person',
      [entityAttributesProperty]: { name },
    }) as unknown as NcNode;

  it('draws only roster rows, keeping their uids and values', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 2 } }),
      [rosterStage],
      { externalData: { 'roster-1': [row('r1', 'Ada'), row('r2', 'Grace')] } },
    );
    expect(result.nodes).toHaveLength(2);
    const uids = result.nodes.map((node) => node.uid).toSorted();
    expect(uids).toEqual(['r1', 'r2']);
    for (const node of result.nodes) {
      expect(['Ada', 'Grace']).toContain(node.attributes.name);
    }
  });

  it('admits nobody from a known-empty roster', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 4 } }),
      [rosterStage],
      { externalData: { 'roster-1': [] } },
    );
    expect(result.nodes).toHaveLength(0);
  });

  it('fabricates when no roster is known', () => {
    const result = plan(
      baseCodebook({ count: { distribution: 'constant', value: 3 } }),
      [rosterStage],
    );
    expect(result.nodes).toHaveLength(3);
  });
});

describe('planNetwork missingness', () => {
  it('nulls variables with certain missingness and records them', () => {
    const result = plan(
      baseCodebook(
        { count: { distribution: 'constant', value: 3 } },
        {
          hobby: {
            name: 'Hobby',
            type: 'text',
            synthetic: { generator: 'occupation', missingProbability: 1 },
          },
        },
      ),
      [nameGenerator(), alterForm('hobby')],
    );
    for (const node of result.nodes) {
      expect(node.attributes.hobby).toBeNull();
      expect(node.missing.has('hobby')).toBe(true);
      expect(node.attributes.name).not.toBeNull();
    }
  });
});

describe('planNetwork edges', () => {
  const censusStage = (createEdge: string) =>
    stage({
      id: `census-${createEdge}`,
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 't', text: 'x' },
      prompts: [{ id: 'p1', text: 'Know?', createEdge }],
    });

  const withEdgeType = (
    codebook: StructuralCodebook,
    type: string,
    synthetic?: Record<string, unknown>,
  ): StructuralCodebook =>
    ({
      ...codebook,
      edge: {
        [type]: {
          name: type,
          variables: {},
          ...(synthetic ? { synthetic } : {}),
        },
      },
    }) as unknown as StructuralCodebook;

  it('links every eligible pair at density 1 and none at density 0', () => {
    const codebook = (value: number) =>
      withEdgeType(
        baseCodebook({ count: { distribution: 'constant', value: 5 } }),
        'knows',
        {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value },
          },
        },
      );
    const full = plan(codebook(1), [nameGenerator(), censusStage('knows')]);
    expect(full.edges).toHaveLength(10); // C(5,2)
    const empty = plan(codebook(0), [nameGenerator(), censusStage('knows')]);
    expect(empty.edges).toHaveLength(0);
  });

  it('targets round(meanDegree × nodes / 2) edges', () => {
    const codebook = withEdgeType(
      baseCodebook({ count: { distribution: 'constant', value: 6 } }),
      'knows',
      {
        topology: {
          metric: 'meanDegree',
          distribution: { distribution: 'constant', value: 3 },
        },
      },
    );
    const result = plan(codebook, [nameGenerator(), censusStage('knows')]);
    expect(result.edges).toHaveLength(9); // 3 × 6 / 2
    for (const edge of result.edges) {
      expect(edge.from).not.toBe(edge.to);
      expect(edge.creationStageIndex).toBe(1);
    }
  });

  it('defaults an edge type with no creating stage to no edges', () => {
    const codebook = withEdgeType(
      baseCodebook({ count: { distribution: 'constant', value: 5 } }),
      'knows',
    );
    const result = plan(codebook, [nameGenerator()]);
    expect(result.edges).toHaveLength(0);
  });
});

describe('planNetwork pedigree structure', () => {
  const pedigreeStage = stage({
    id: 'ped',
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'family_member',
      nodeLabelVariable: 'label',
      egoVariable: 'is_ego',
      relationshipVariable: 'relationship',
      biologicalSexVariable: 'sex',
    },
    edgeConfig: {
      type: 'family_link',
      relationshipTypeVariable: 'link_type',
      isActiveVariable: 'active',
      isGestationalCarrierVariable: 'carrier',
      gameteRoleVariable: 'gamete',
    },
    framing: { mode: 'fixed', value: 'inclusive' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    censusPrompt: 'Add your family.',
  });

  const pedigreeCodebook = {
    node: {
      family_member: {
        name: 'Family member',
        synthetic: { count: { distribution: 'constant', value: 5 } },
        variables: {
          label: { name: 'Label', type: 'text' },
          is_ego: { name: 'Is_Ego', type: 'boolean' },
          relationship: { name: 'Relationship', type: 'text' },
          sex: { name: 'Sex', type: 'text' },
        },
      },
    },
    edge: {
      family_link: {
        name: 'Family link',
        variables: {
          link_type: {
            name: 'Link_Type',
            type: 'categorical',
            options: [
              { label: 'Biological', value: 'biological' },
              { label: 'Adoptive', value: 'adoptive' },
            ],
          },
          active: { name: 'Active', type: 'boolean' },
        },
      },
    },
    ego: { variables: {} },
  } as unknown as StructuralCodebook;

  it('leaves a pedigree entirely to its own generator', () => {
    // A family is a structure, not a population: its people have to satisfy
    // each other — two genetic parents each, consistent sexes, an inheritance
    // pattern the diseases follow — which the specialist generator settles as
    // a whole at materialisation. Planning people for it here would produce a
    // second, contradictory family.
    const result = plan(pedigreeCodebook, [pedigreeStage]);

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

describe('planNetwork determinism', () => {
  const snapshot = (result: ReturnType<typeof plan>) =>
    JSON.stringify({
      ego: result.ego.attributes,
      nodes: result.nodes.map((node) => ({
        uid: node.uid,
        attributes: node.attributes,
        stage: node.creationStageIndex,
      })),
      edges: result.edges.map((edge) => ({
        uid: edge.uid,
        from: edge.from,
        to: edge.to,
      })),
    });

  it('replays the identical plan for the same seed', () => {
    const build = () =>
      plan(
        baseCodebook({ count: { distribution: 'constant', value: 5 } }),
        [nameGenerator()],
        { seed: 7 },
      );
    expect(snapshot(build())).toEqual(snapshot(build()));
  });

  it('differs across seeds', () => {
    const build = (seed: number) =>
      plan(
        baseCodebook({ count: { distribution: 'constant', value: 5 } }),
        [nameGenerator()],
        { seed },
      );
    expect(snapshot(build(1))).not.toEqual(snapshot(build(2)));
  });

  it('keeps a variable unperturbed when an unrelated variable is added', () => {
    const withoutExtra = plan(
      baseCodebook({ count: { distribution: 'constant', value: 4 } }),
      [nameGenerator()],
      { seed: 11 },
    );
    const withExtra = plan(
      baseCodebook(
        { count: { distribution: 'constant', value: 4 } },
        {
          unrelated: {
            name: 'Unrelated',
            type: 'number',
            synthetic: { distribution: 'uniform', min: 0, max: 100 },
          },
        },
      ),
      [nameGenerator()],
      { seed: 11 },
    );
    expect(withExtra.nodes.map((node) => node.attributes.age)).toEqual(
      withoutExtra.nodes.map((node) => node.attributes.age),
    );
    expect(withExtra.nodes.map((node) => node.attributes.name)).toEqual(
      withoutExtra.nodes.map((node) => node.attributes.name),
    );
  });
});
