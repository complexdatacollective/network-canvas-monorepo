import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  FRAMING_IDS,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../../generateNetwork';

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const codebook = (
  overrides: Record<string, unknown> = {},
): StructuralCodebook =>
  ({
    node: {
      person: {
        name: 'Person',
        synthetic: { count: { distribution: 'constant', value: 4 } },
        variables: {
          name: { name: 'Name', type: 'text' },
          age: {
            name: 'Age',
            type: 'number',
            synthetic: { distribution: 'normal', mean: 34, sd: 6 },
          },
          rank: {
            name: 'Rank',
            type: 'ordinal',
            options: [
              { label: 'Low', value: 1 },
              { label: 'High', value: 2 },
            ],
          },
          orphaned: { name: 'Orphaned', type: 'text' },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'constant', value: 1 },
          },
        },
        variables: {},
      },
    },
    ego: { variables: { egoAge: { name: 'EgoAge', type: 'number' } } },
    ...overrides,
  }) as unknown as StructuralCodebook;

const nameGenerator = stage({
  id: 'ng',
  type: 'NameGeneratorQuickAdd',
  label: 'Names',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'ng-p1', text: 'Who?' }],
});

const alterForm = stage({
  id: 'af',
  type: 'AlterForm',
  label: 'Details',
  subject: { entity: 'node', type: 'person' },
  form: { fields: [{ variable: 'age', prompt: 'Age?' }] },
});

const dyadCensus = stage({
  id: 'dc',
  type: 'DyadCensus',
  label: 'Census',
  subject: { entity: 'node', type: 'person' },
  introductionPanel: { title: 't', text: 'x' },
  prompts: [{ id: 'dc-p1', text: 'Know?', createEdge: 'knows' }],
});

const egoForm = stage({
  id: 'ef',
  type: 'EgoForm',
  label: 'You',
  form: { fields: [{ variable: 'egoAge', prompt: 'Age?' }] },
});

describe('generateNetwork (plan → materialise pipeline)', () => {
  it('produces the stable result contract end to end', () => {
    const result = generateNetwork({
      codebook: codebook(),
      stages: [nameGenerator, alterForm, dyadCensus, egoForm],
      seed: 42,
    });

    expect(result.network.nodes).toHaveLength(4);
    expect(result.network.edges).toHaveLength(6); // density 1 over C(4,2)
    expect(result.currentStep).toBe(4);
    expect(result.droppedOut).toBe(false);

    for (const node of result.network.nodes) {
      expect(node.stageId).toBe('ng');
      expect(node.promptIDs).toEqual(['ng-p1']);
      const attributes = node[entityAttributesProperty];
      // Written by creation (quickAdd) and the alter form respectively.
      expect(typeof attributes.name).toBe('string');
      expect(typeof attributes.age).toBe('number');
      // No stage writes these: a real interview never collects them.
      expect(attributes).not.toHaveProperty('rank');
      expect(attributes).not.toHaveProperty('orphaned');
    }

    expect(typeof result.network.ego?.[entityAttributesProperty].egoAge).toBe(
      'number',
    );
  });

  it('emits census tuples consistent with the final graph', () => {
    const linked = generateNetwork({
      codebook: codebook(),
      stages: [nameGenerator, dyadCensus],
      seed: 1,
    });
    const tuples = (linked.stageMetadata?.[1] ?? []) as [
      number,
      string,
      string,
      boolean,
    ][];
    expect(tuples).toHaveLength(6);
    for (const [promptIndex, , , answer] of tuples) {
      expect(promptIndex).toBe(0);
      expect(answer).toBe(true);
    }

    const unlinked = generateNetwork({
      codebook: codebook({
        edge: {
          knows: {
            name: 'Knows',
            synthetic: {
              topology: {
                metric: 'density',
                distribution: { distribution: 'constant', value: 0 },
              },
            },
            variables: {},
          },
        },
      }),
      stages: [nameGenerator, dyadCensus],
      seed: 1,
    });
    expect(unlinked.network.edges).toHaveLength(0);
    const negatives = (unlinked.stageMetadata?.[1] ?? []) as [
      number,
      string,
      string,
      boolean,
    ][];
    expect(negatives).toHaveLength(6);
    expect(negatives.every(([, , , answer]) => answer === false)).toBe(true);
  });

  it('links census tuple uids to materialised nodes', () => {
    const result = generateNetwork({
      codebook: codebook(),
      stages: [nameGenerator, dyadCensus],
      seed: 3,
    });
    const uids = new Set(
      result.network.nodes.map((node) => node[entityPrimaryKeyProperty]),
    );
    const tuples = (result.stageMetadata?.[1] ?? []) as [
      number,
      string,
      string,
      boolean,
    ][];
    for (const [, a, b] of tuples) {
      expect(uids.has(a)).toBe(true);
      expect(uids.has(b)).toBe(true);
    }
  });

  it('reports pedigree and composer metadata', () => {
    const result = generateNetwork({
      codebook: {
        node: {
          family_member: {
            name: 'Family member',
            synthetic: { count: { distribution: 'constant', value: 3 } },
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
        ego: {},
      } as unknown as StructuralCodebook,
      stages: [
        stage({
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
          framing: { mode: 'participantChoice' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'off',
          },
          censusPrompt: 'Add your family.',
        }),
      ],
      seed: 5,
    });

    expect(result.network.nodes).toHaveLength(3);
    expect(result.network.edges).toHaveLength(2);
    const metadata = result.stageMetadata?.[0] as {
      isNetworkCommitted: boolean;
      selectedFraming?: string;
    };
    expect(metadata.isNetworkCommitted).toBe(true);
    expect(FRAMING_IDS).toContain(metadata.selectedFraming);

    for (const edge of result.network.edges) {
      expect(edge[entityAttributesProperty].link_type).toEqual(['biological']);
      expect(edge[entityAttributesProperty].active).toBe(true);
    }
  });

  it('simulates drop-out with an aggressive factor', () => {
    const result = generateNetwork({
      codebook: codebook(),
      stages: [nameGenerator, alterForm, dyadCensus, egoForm],
      seed: 42,
      simulateDropOut: true,
      config: { dropOutFactor: 10 },
    });
    expect(result.droppedOut).toBe(true);
    expect(result.currentStep).toBeLessThan(4);
  });

  it('leaves an in-progress bin stage partially unanswered', () => {
    const ordinalBin = stage({
      id: 'ob',
      type: 'OrdinalBin',
      label: 'Rank',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        { id: 'ob-p1', text: 'Rank', variable: 'rank', color: 'ord-color-seq-1' },
      ],
    });
    const result = generateNetwork({
      codebook: codebook(),
      stages: [nameGenerator, ordinalBin],
      seed: 42,
      inProgressStageIndex: 1,
    });
    const values = result.network.nodes.map(
      (node) => node[entityAttributesProperty].rank,
    );
    expect(values.some((value) => value === null)).toBe(true);
  });

  it('reproduces byte-identical results for a fixed seed', () => {
    const run = () =>
      generateNetwork({
        codebook: codebook(),
        stages: [nameGenerator, alterForm, dyadCensus, egoForm],
        seed: 99,
        config: { today: '2026-08-06' },
      });
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
