import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * var-x is boolean, written by no stage, tied to the pedigree ego variable by
 * `differentFrom`, and declares `missingProbability: 1` — the codebook says it
 * is ALWAYS unanswered. Any node holding a value for it contradicts the
 * declared missingness contract.
 */
function makeCodebook(): Codebook {
  return {
    node: {
      'node-type-1': {
        color: 'node-color-seq-1',
        variables: {
          'var-name': { name: 'Name', type: 'text' },
          'var-ego': { name: 'Is ego', type: 'boolean' },
          'var-x': {
            name: 'Rule-tied never-answered',
            type: 'boolean',
            validation: { differentFrom: 'var-ego' },
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
    // Through `unknown`: `differentFrom` is branded in the schema type, and
    // this literal carries a plain string.
  } as unknown as Codebook;
}

function makeNameGeneratorStage(): Stage {
  return {
    id: 'stage-ng',
    label: 'Name Generator',
    type: 'NameGenerator',
    subject: { entity: 'node', type: 'node-type-1' },
    form: {
      title: 'Add a person',
      fields: [{ variable: 'var-name', prompt: 'Name' }],
    },
    prompts: [{ id: 'prompt-ng', text: 'Add people' }],
    synthetic: { count: { distribution: 'constant', value: 6 } },
    behaviours: { minNodes: 5, maxNodes: 8 },
  } as Stage;
}

function makeFamilyPedigreeStage(): Stage {
  return {
    id: 'stage-fp',
    label: 'Family',
    type: 'FamilyPedigree',
    nodeConfig: {
      type: 'node-type-1',
      nodeLabelVariable: 'var-name',
      egoVariable: 'var-ego',
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
}

describe('FamilyPedigree missingness on pre-existing nodes', () => {
  it('applies missingProbability: 1 to rule-tied draws on pre-existing family members', () => {
    const { network } = generateNetwork({
      codebook: makeCodebook(),
      stages: [makeNameGeneratorStage(), makeFamilyPedigreeStage()],
      seed: 42,
    });

    const preexisting = network.nodes.filter(
      (node) => node.stageId === 'stage-ng',
    );
    const familyCreated = network.nodes.filter(
      (node) => node.stageId === 'stage-fp',
    );
    // Sanity: the construction produced both populations.
    expect(preexisting.length).toBeGreaterThan(0);
    expect(familyCreated.length).toBeGreaterThan(0);

    // missingProbability: 1 means var-x is unanswered on EVERY node —
    // regardless of which pedigree path (new relative vs pre-existing
    // normalisation) drew its rule-tied closure.
    for (const node of network.nodes) {
      expect(
        node[entityAttributesProperty],
        `node from ${String(node.stageId)} should not hold var-x`,
      ).not.toHaveProperty('var-x');
    }
  });
});
