import { describe, expect, it } from 'vitest';

import { type Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * A unique number variable whose value space holds exactly two values (1..2),
 * declared certainly missing (missingProbability: 1) and not required. The
 * FamilyPedigree stage renders it as a node-form field, so the pedigree
 * materialiser puts it in every relative's draw set. The pedigree always
 * builds a >=7-person core, so if each relative's draw claims a unique value
 * before the missingness pass deletes it, the third relative finds both
 * values taken and generation fails — even though the declared final state
 * holds no value for the variable on any node.
 */
const codebook: Codebook = {
  node: {
    'node-type-1': {
      color: 'node-color-seq-1',
      variables: {
        'var-name': { name: 'Name', type: 'text' },
        'var-u': {
          name: 'Unique but never answered',
          type: 'number',
          validation: { unique: true, minValue: 1, maxValue: 2 },
          synthetic: { missingProbability: 1 },
        },
      },
    },
  },
  edge: {
    'edge-type-1': {
      color: 'edge-color-seq-1',
      variables: {},
    },
  },
} as Codebook;

const stage: Stage = {
  id: 'stage-fp',
  label: 'Family',
  type: 'FamilyPedigree',
  nodeConfig: {
    type: 'node-type-1',
    nodeLabelVariable: 'var-name',
    form: [{ variable: 'var-u', prompt: 'U' }],
  },
  edgeConfig: {
    type: 'edge-type-1',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
  censusPrompt: 'Tell us about your family',
} as unknown as Stage;

describe('plan path (NameGenerator) with the same certainly-missing unique variable', () => {
  it('succeeds, showing the protocol is valid under the fixed plan path', () => {
    const ngStage: Stage = {
      id: 'stage-ng',
      label: 'Name Generator',
      type: 'NameGenerator',
      subject: { entity: 'node', type: 'node-type-1' },
      form: {
        title: 'Add a person',
        fields: [
          { variable: 'var-name', prompt: 'Name' },
          { variable: 'var-u', prompt: 'U' },
        ],
      },
      prompts: [{ id: 'prompt-ng', text: 'Add people' }],
      synthetic: { count: { distribution: 'constant', value: 7 } },
      behaviours: { minNodes: 7, maxNodes: 7 },
    } as Stage;
    const { network } = generateNetwork({
      codebook,
      stages: [ngStage],
      seed: 1,
    });
    expect(network.nodes.length).toBe(7);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty]).not.toHaveProperty('var-u');
    }
  });
});

describe('FamilyPedigree with a certainly-missing unique form field', () => {
  it('generates the family without exhausting the unique value space', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const { network } = generateNetwork({
        codebook,
        stages: [stage],
        seed,
      });
      expect(network.nodes.length).toBeGreaterThan(2);
      for (const node of network.nodes) {
        expect(node[entityAttributesProperty]).not.toHaveProperty('var-u');
      }
    }
  });
});
