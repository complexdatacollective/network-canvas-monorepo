import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A variable written only behind a filter is drawn during the walk rather than
 * planned, and a `unique` draw CLAIMS its value from the run's registry. So the
 * walk needs the same exemption the plan has: a group that is certainly missing
 * holds no values, and drawing one only to null it can exhaust a small space
 * and fail a session whose final state is empty.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      synthetic: { count: { distribution: 'constant', value: 3 } },
      variables: {
        local: {
          name: 'Local',
          type: 'boolean',
          synthetic: { probabilityTrue: 1 },
        },
        flag: {
          name: 'Flag',
          type: 'boolean',
          validation: { unique: true },
          synthetic: { probabilityTrue: 0.5, missingProbability: 1 },
        },
      },
    },
  },
  ego: { variables: {} },
  edge: {},
} as unknown as StructuralCodebook;

const generator = {
  id: 'ng',
  type: 'NameGeneratorQuickAdd',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'local',
  prompts: [{ id: 'ng-p', text: 'Who?' }],
} as unknown as Stage;

/** Gated on a non-unique attribute, so the write is settled during the walk. */
const filteredForm = {
  id: 'form',
  type: 'AlterForm',
  label: 'About',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'About', fields: [{ variable: 'flag', prompt: 'Flag?' }] },
  filter: {
    join: 'AND',
    rules: [
      {
        id: 'r',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'local',
          operator: 'EXACTLY',
          value: true,
        },
      },
    ],
  },
} as unknown as Stage;

describe('a certainly-missing unique variable written during the walk', () => {
  it('leaves every entity unanswered rather than exhausting the registry', () => {
    const { network } = generateNetwork({
      seed: 3,
      codebook,
      stages: [generator, filteredForm],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty].flag ?? null).toBeNull();
    }
  });
});
