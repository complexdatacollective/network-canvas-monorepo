import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * Every draw takes a stream addressed by what it is drawing FOR, so that
 * changing one part of a protocol cannot move another. A variable key is not
 * that address on its own: a codebook may use one key for separate
 * definitions under two entity types, and a shared stream makes the two
 * perturb each other — the design's guarantee is that "adding an unrelated
 * variable or random draw must not perturb existing generated names or
 * unrelated attributes".
 */

const codebookWith = (personCount: number) =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        synthetic: { count: { distribution: 'constant', value: personCount } },
        variables: {
          note: {
            name: 'Note',
            type: 'text',
            synthetic: { generator: 'firstName' },
          },
        },
      },
      org: {
        name: 'Org',
        color: 'node-color-seq-2',
        synthetic: { count: { distribution: 'constant', value: 3 } },
        variables: {
          note: {
            name: 'Note',
            type: 'text',
            synthetic: { generator: 'firstName' },
          },
        },
      },
    },
    ego: { variables: {} },
    edge: {},
  }) as unknown as StructuralCodebook;

const generator = (id: string, type: string) =>
  ({
    id,
    type: 'NameGenerator',
    label: id,
    subject: { entity: 'node', type },
    form: {
      title: 'About',
      fields: [{ variable: 'note', prompt: 'Note' }],
    },
    prompts: [{ id: `${id}-p`, text: 'Who?' }],
  }) as unknown as Stage;

const notesFor = (type: string, personCount: number): unknown[] => {
  const { network } = generateNetwork({
    seed: 9,
    codebook: codebookWith(personCount),
    stages: [generator('ng-person', 'person'), generator('ng-org', 'org')],
  });

  return network.nodes
    .filter((node) => node.type === type)
    .map((node) => node[entityAttributesProperty].note);
};

describe('one variable key under two node types', () => {
  it('leaves each scope’s values untouched by the other’s population', () => {
    // Only the person count changes. Sharing a stream let that advance the
    // sequence the org type drew from, so its values moved under one seed.
    expect(notesFor('org', 5)).toEqual(notesFor('org', 2));
  });

  it('still gives the two scopes different values', () => {
    // Independent, not identical: the scope is part of the address, so the
    // two definitions draw their own sequences.
    expect(notesFor('person', 3)).not.toEqual(notesFor('org', 3));
  });
});
