import { describe, expect, it } from 'vitest';

import {
  MAX_SYNTHETIC_POPULATION,
  type Stage,
} from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * The run-wide population cap exists because generation is synchronous on
 * Architect's main thread, so it has to hold whatever the protocol declares.
 *
 * A FamilyPedigree's core is structural — a family needs its seven people to
 * hold together as one — so the specialist generator marks them required and
 * they pass through `maxNodes` untouched. Clamping the pedigree's ceiling
 * therefore could not enforce the remainder: an ordinary generator that spends
 * the whole budget left the family to be appended on top of it, and a second
 * pedigree to be appended again. The reservation has to happen where the
 * budget is SPENT, not where the family is built.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        isEgo: { name: 'Is ego', type: 'boolean' },
        relationship: { name: 'Relationship', type: 'text' },
        sex: { name: 'Sex', type: 'text' },
      },
    },
  },
  edge: {},
} as unknown as Codebook;

const pedigree = (id: string): Stage =>
  ({
    id,
    type: 'FamilyPedigree',
    label: 'Family',
    nodeConfig: {
      type: 'person',
      nodeLabelVariable: 'name',
      egoVariable: 'isEgo',
      relationshipVariable: 'relationship',
      biologicalSexVariable: 'sex',
    },
    edgeConfig: {
      type: 'relation',
      relationshipTypeVariable: 'relType',
      isActiveVariable: 'isActive',
      isGestationalCarrierVariable: 'carrier',
      gameteRoleVariable: 'gamete',
    },
    framing: { mode: 'fixed', value: 'gendered' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    censusPrompt: 'Add your family.',
  }) as unknown as Stage;

/** A generator asking for the entire run budget on its own. */
const hungryGenerator = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: {
    count: { distribution: 'constant', value: MAX_SYNTHETIC_POPULATION },
  },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
} as unknown as Stage;

describe('the population cap holds across a pedigree', () => {
  // The ordering the first version of this test missed. A pedigree standing
  // BEFORE the stages that spend the budget sees an almost empty session and
  // grows to its own ceiling; the people already committed to those later
  // stages are then materialised on top of it. Reserving only the required
  // core held in one order and not the other.
  it('stays within the cap when a pedigree PRECEDES the generator', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [pedigree('stage-pedigree'), hungryGenerator],
    });

    expect(network.nodes.length).toBeLessThanOrEqual(MAX_SYNTHETIC_POPULATION);
  });

  it('stays within the cap when several pedigrees precede it', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [
        pedigree('stage-pedigree-1'),
        pedigree('stage-pedigree-2'),
        pedigree('stage-pedigree-3'),
        hungryGenerator,
      ],
    });

    expect(network.nodes.length).toBeLessThanOrEqual(MAX_SYNTHETIC_POPULATION);
  });

  it('stays within the cap when a pedigree follows a budget-filling generator', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [hungryGenerator, pedigree('stage-pedigree')],
    });

    expect(network.nodes.length).toBeLessThanOrEqual(MAX_SYNTHETIC_POPULATION);
  });

  it('stays within the cap when several pedigrees follow it', () => {
    // Each pedigree appended its own core to an already-exhausted budget, so
    // the overshoot grew with the number of families rather than being bounded
    // once.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [
        hungryGenerator,
        pedigree('stage-pedigree-1'),
        pedigree('stage-pedigree-2'),
        pedigree('stage-pedigree-3'),
      ],
    });

    expect(network.nodes.length).toBeLessThanOrEqual(MAX_SYNTHETIC_POPULATION);
  });
});
