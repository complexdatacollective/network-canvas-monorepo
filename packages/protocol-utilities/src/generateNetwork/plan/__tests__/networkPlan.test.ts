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
import { planNetwork } from '../networkPlan';

const TODAY = '2026-08-06';

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

/** `count` is sugar for the stage's own `synthetic.count` declaration. */
const nameGenerator = (
  overrides: Record<string, unknown> = {},
  count?: number,
): Stage =>
  stage({
    id: 'ng-1',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'p1', text: 'Who?' }],
    ...(count === undefined
      ? {}
      : { synthetic: { count: { distribution: 'constant', value: count } } }),
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

describe('planNetwork populations', () => {
  it('draws the declared constant population', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({}, 5),
      alterForm('age'),
    ]);
    expect(result.nodes).toHaveLength(5);
    for (const node of result.nodes) {
      expect(node.creationStageIndex).toBe(0);
      expect(node.type).toBe('person');
      expect(typeof node.attributes.name).toBe('string');
      expect(typeof node.attributes.age).toBe('number');
    }
  });

  it('caps the population at stage capacity', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ behaviours: { maxNodes: 3 } }, 10),
    ]);
    expect(result.nodes).toHaveLength(3);
  });

  it('raises the population to a stage minimum', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ behaviours: { minNodes: 2 } }, 0),
    ]);
    expect(result.nodes).toHaveLength(2);
  });

  it('plans nobody for a type no stage creates', () => {
    const result = plan(baseCodebook(), []);
    expect(result.nodes).toHaveLength(0);
  });

  it('gives each creating stage the population it declares', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({}, 3),
      nameGenerator({ id: 'ng-2' }, 3),
    ]);
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
      baseCodebook({
        close: { name: 'Close', type: 'boolean' },
      }),
      [
        nameGenerator({
          synthetic: { count: { distribution: 'constant', value: 4 } },
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

describe('planNetwork against the population ceiling', () => {
  // `behaviours.minNodes` is a floor the planner must honour and the stage
  // schema puts no ceiling on it, so a schema-valid minimum walks straight
  // past the cap that keeps a synchronous preview from freezing the renderer.
  it('trims a stage minimum that would exceed it', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ behaviours: { minNodes: 9_000_000 } }, 1),
    ]);
    expect(result.nodes).toHaveLength(10_000);
  });

  it('trims the SUM when several stages each sit inside it', () => {
    // Each is legal alone; together they are not.
    const result = plan(baseCodebook(), [
      nameGenerator({ id: 'ng-a', behaviours: { minNodes: 9_000 } }, 1),
      nameGenerator({ id: 'ng-b', behaviours: { minNodes: 9_000 } }, 1),
    ]);
    expect(result.nodes).toHaveLength(10_000);
    // Trimmed from the last stage back, so the first keeps what it asked for.
    const first = result.nodes.filter(
      (node) => node.creationStageIndex === 0,
    ).length;
    expect(first).toBe(9_000);
  });

  it('leaves minimums inside the ceiling exactly as they were', () => {
    const result = plan(baseCodebook(), [
      nameGenerator({ id: 'ng-a', behaviours: { minNodes: 2 } }, 0),
      nameGenerator({ id: 'ng-b', behaviours: { minNodes: 3 } }, 0),
    ]);
    expect(result.nodes).toHaveLength(5);
  });
});

describe('planNetwork rosters', () => {
  const rosterStage = (count: number) =>
    stage({
      id: 'roster-1',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      synthetic: { count: { distribution: 'constant', value: count } },
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
    const result = plan(baseCodebook(), [rosterStage(2)], {
      externalData: { 'roster-1': [row('r1', 'Ada'), row('r2', 'Grace')] },
    });
    expect(result.nodes).toHaveLength(2);
    const uids = result.nodes.map((node) => node.uid).toSorted();
    expect(uids).toEqual(['r1', 'r2']);
    for (const node of result.nodes) {
      expect(['Ada', 'Grace']).toContain(node.attributes.name);
    }
  });

  it('refuses a known-empty roster its stage was told to draw from', () => {
    // The contract changed with the move of counts onto stages. A stage that
    // declares four people and a roster that resolved to none is a protocol
    // the researcher needs to hear about; building nobody and carrying on is
    // how an under-provisioned roster used to go unnoticed.
    expect(() =>
      plan(baseCodebook(), [rosterStage(4)], {
        externalData: { 'roster-1': [] },
      }),
    ).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('admits nobody from a known-empty roster asked for nobody', () => {
    const result = plan(baseCodebook(), [rosterStage(0)], {
      externalData: { 'roster-1': [] },
    });
    expect(result.nodes).toHaveLength(0);
  });

  it('fabricates when no roster is known', () => {
    const result = plan(baseCodebook(), [rosterStage(3)]);
    expect(result.nodes).toHaveLength(3);
  });
});

describe('planNetwork missingness', () => {
  it('nulls variables with certain missingness and records them', () => {
    const result = plan(
      baseCodebook({
        hobby: {
          name: 'Hobby',
          type: 'text',
          synthetic: { generator: 'occupation', missingProbability: 1 },
        },
      }),
      [nameGenerator({}, 3), alterForm('hobby')],
    );
    for (const node of result.nodes) {
      expect(node.attributes.hobby).toBeNull();
      expect(node.missing.has('hobby')).toBe(true);
      expect(node.attributes.name).not.toBeNull();
    }
  });
});

describe('planNetwork edges', () => {
  // Topology is declared by the stage that creates the edges, so the census
  // carries it rather than the edge type.
  const censusStage = (
    createEdge: string,
    topology?: Record<string, unknown>,
  ) =>
    stage({
      id: `census-${createEdge}`,
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: { title: 't', text: 'x' },
      ...(topology ? { synthetic: { topology } } : {}),
      prompts: [{ id: 'p1', text: 'Know?', createEdge }],
    });

  const withEdgeType = (
    codebook: StructuralCodebook,
    type: string,
  ): StructuralCodebook =>
    ({
      ...codebook,
      edge: { [type]: { name: type, variables: {} } },
    }) as unknown as StructuralCodebook;

  it('links every eligible pair at density 1 and none at density 0', () => {
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const census = (value: number) =>
      censusStage('knows', {
        metric: 'density',
        distribution: { distribution: 'constant', value },
      });
    const full = plan(codebook, [nameGenerator({}, 5), census(1)]);
    expect(full.edges).toHaveLength(10); // C(5,2)
    const empty = plan(codebook, [nameGenerator({}, 5), census(0)]);
    expect(empty.edges).toHaveLength(0);
  });

  it('targets round(meanDegree × nodes / 2) edges', () => {
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [
      nameGenerator({}, 6),
      censusStage('knows', {
        metric: 'meanDegree',
        distribution: { distribution: 'constant', value: 3 },
      }),
    ]);
    expect(result.edges).toHaveLength(9); // 3 × 6 / 2
    for (const edge of result.edges) {
      expect(edge.from).not.toBe(edge.to);
      expect(edge.creationStageIndex).toBe(1);
    }
  });

  it('stamps an edge with the stage that selected it', () => {
    // Two censuses over one edge type: the first wants none, the second wants
    // every pair. The pairs enter the domain at the FIRST census, so stamping
    // where a pair entered would materialise these edges a stage early —
    // changing what later filters, skip logic and census answers see.
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [
      nameGenerator({}, 3),
      censusStage('knows', {
        metric: 'density',
        distribution: { distribution: 'constant', value: 0 },
      }),
      stage({
        ...censusStage('knows', {
          metric: 'density',
          distribution: { distribution: 'constant', value: 1 },
        }),
        id: 'census-late',
      }),
    ]);

    expect(result.edges).toHaveLength(3); // C(3, 2)
    for (const edge of result.edges) {
      expect(edge.creationStageIndex).toBe(2);
    }
  });

  it('defaults an edge type with no creating stage to no edges', () => {
    const codebook = withEdgeType(baseCodebook(), 'knows');
    const result = plan(codebook, [nameGenerator({}, 5)]);
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
      plan(baseCodebook(), [nameGenerator({}, 5)], { seed: 7 });
    expect(snapshot(build())).toEqual(snapshot(build()));
  });

  it('differs across seeds', () => {
    const build = (seed: number) =>
      plan(baseCodebook(), [nameGenerator({}, 5)], { seed });
    expect(snapshot(build(1))).not.toEqual(snapshot(build(2)));
  });

  it('keeps a variable unperturbed when an unrelated variable is added', () => {
    const withoutExtra = plan(baseCodebook(), [nameGenerator({}, 4)], {
      seed: 11,
    });
    const withExtra = plan(
      baseCodebook({
        unrelated: {
          name: 'Unrelated',
          type: 'number',
          synthetic: { distribution: 'uniform', min: 0, max: 100 },
        },
      }),
      [nameGenerator({}, 4)],
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
