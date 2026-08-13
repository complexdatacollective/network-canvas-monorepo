import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';
import { reachableStagesForFeasibility } from '../constraints/reachableStages';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * A settled skip standing inside a span the planner may jump over differently.
 *
 * `stage-outer` guards on a Boolean the seed decides, so the pre-pass cannot
 * settle it and marks the stages its jump would clear as ones the plan may
 * never arrive at. `stage-inner` sits among them and guards on a Boolean
 * declared certain, which the pre-pass DOES settle. Spending that inner jump
 * walked the pre-pass to the end of the protocol and dropped the creator, while
 * the session — whose drawn ego settles the outer guard instead — jumps
 * straight to that creator and collects its two people.
 */
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
    },
  },
  edge: {},
  ego: {
    variables: {
      other: {
        name: 'Other',
        type: 'boolean',
        synthetic: { probabilityTrue: 0.5 },
      },
      flag: {
        name: 'Flag',
        type: 'boolean',
        synthetic: { probabilityTrue: 1 },
      },
    },
  },
} as unknown as Codebook;

const egoForm = {
  id: 'stage-form',
  type: 'EgoForm',
  label: 'Form',
  introductionPanel: { title: 'Form', text: 'Form' },
  form: {
    fields: [
      { variable: 'other', prompt: 'Other?' },
      { variable: 'flag', prompt: 'Flag?' },
    ],
  },
} as unknown as Stage;

const guarded = (
  id: string,
  attribute: string,
  destinationStageId: string,
): Stage =>
  ({
    id,
    type: 'Information',
    label: id,
    items: [],
    skipLogic: {
      action: 'SKIP',
      filter: {
        rules: [
          {
            id: `${id}-rule`,
            type: 'ego',
            options: { attribute, operator: 'EXACTLY', value: true },
          },
        ],
      },
      destination: { type: 'stage', stageId: destinationStageId },
    },
  }) as unknown as Stage;

const info = (id: string): Stage =>
  ({ id, type: 'Information', label: id, items: [] }) as unknown as Stage;

const creator = {
  id: 'stage-creator',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 2 } },
  behaviours: { minNodes: 2, maxNodes: 2 },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
} as unknown as Stage;

const stages: Stage[] = [
  egoForm,
  guarded('stage-outer', 'other', 'stage-creator'),
  guarded('stage-inner', 'flag', 'stage-end'),
  info('stage-filler'),
  creator,
  info('stage-filler2'),
  info('stage-end'),
];

describe('a settled skip inside a span the planner may jump over', () => {
  it('keeps the stages the withheld jump would have cleared', () => {
    // The inner guard's own stage still goes — settled either way — but its
    // destination may not carry the walk past `stage-creator`, which the plan
    // reaches whenever the outer guard fires.
    expect(
      reachableStagesForFeasibility(codebook, stages, true).map(
        (stage) => stage.id,
      ),
    ).toEqual([
      'stage-form',
      'stage-outer',
      'stage-filler',
      'stage-creator',
      'stage-filler2',
      'stage-end',
    ]);
  });

  it('builds the creator on every seed whose ego takes the outer jump', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages,
        respectSkipLogicAndFiltering: true,
      });

      // `other` true jumps `stage-outer` straight to the creator, never
      // evaluating `stage-inner`; false walks into `stage-inner`, whose certain
      // flag jumps the session to the end and leaves nobody behind.
      expect(network.nodes, `seed ${seed}`).toHaveLength(
        network.ego.attributes.other === true ? 2 : 0,
      );
    }
  });
});
