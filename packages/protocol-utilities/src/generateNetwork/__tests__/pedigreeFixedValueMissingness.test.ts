import { describe, expect, it } from 'vitest';

import { type Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const sexOptions = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

function makeCodebook(): Codebook {
  return {
    node: {
      'node-type-1': {
        color: 'node-color-seq-1',
        variables: {
          'var-name': { name: 'Name', type: 'text' },
          'var-sex': {
            name: 'Sex',
            type: 'categorical',
            options: sexOptions,
          },
          'var-sex-copy': {
            name: 'Sex copy',
            type: 'categorical',
            options: sexOptions,
            validation: { sameAs: 'var-sex' },
            synthetic: { missingProbability: 0.5 },
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
  } as unknown as Codebook;
}

function makeFamilyPedigreeStage(): Stage {
  return {
    id: 'stage-fp',
    label: 'Family',
    type: 'FamilyPedigree',
    nodeConfig: {
      type: 'node-type-1',
      nodeLabelVariable: 'var-name',
      biologicalSexVariable: 'var-sex',
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

function makeAlterFormStage(): Stage {
  return {
    id: 'stage-af',
    label: 'Alter form',
    type: 'AlterForm',
    subject: { entity: 'node', type: 'node-type-1' },
    form: {
      fields: [{ variable: 'var-sex-copy', prompt: 'Sex copy' }],
    },
  } as unknown as Stage;
}

describe('unplanned missingness vs pedigree-fixed values', () => {
  it('never deletes the biological sex the pedigree fixed at creation', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { network } = generateNetwork({
        codebook: makeCodebook(),
        stages: [makeFamilyPedigreeStage(), makeAlterFormStage()],
        seed,
      });

      expect(network.nodes.length).toBeGreaterThan(1);
      for (const node of network.nodes) {
        const attrs = node[entityAttributesProperty];
        // The pedigree fixes the biological sex variable on every person it
        // creates, and no later stage rewrites it: it must survive to the
        // finished network. The AlterForm's `var-sex-copy` may legitimately
        // come back missing, but its `sameAs` sibling `var-sex` was answered
        // by the creating interaction and must not be deleted with it.
        expect(
          attrs['var-sex'],
          `node ${node.type} (seed ${seed}) lost its pedigree-fixed sex value`,
        ).toBeDefined();
        // And when the copy IS present it must equal the fixed value.
        if (attrs['var-sex-copy'] !== undefined) {
          expect(attrs['var-sex-copy']).toStrictEqual(attrs['var-sex']);
        }
      }
    }
  });
});
