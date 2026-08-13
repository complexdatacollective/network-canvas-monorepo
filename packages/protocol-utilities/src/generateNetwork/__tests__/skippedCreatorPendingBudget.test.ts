import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * People the plan holds for a creator the walk passed over are never placed,
 * so they are not "still to come" — their stage has already gone by.
 *
 * Counted as pending anyway, a large skipped creator reserved room for a stage
 * that would never spend it, and the family after it was squeezed towards its
 * required core while the finished network had space to spare.
 *
 * The guard reads an ALTER, so the plan cannot settle it and plans the
 * creator's people in full; the walk then skips it.
 */
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
} as unknown as StructuralCodebook;

/** Someone has to exist first, or the alter rule below matches nothing. */
const seed = {
  id: 'stage-seed',
  type: 'NameGenerator',
  label: 'A few',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 3 } },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'seed-p', text: 'Name people' }],
} as unknown as Stage;

const skippedBulk = {
  id: 'stage-skipped',
  type: 'NameGenerator',
  label: 'Never reached',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 9990 } },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'sk-p', text: 'Name people' }],
  skipLogic: {
    action: 'SKIP',
    filter: {
      join: 'AND',
      rules: [
        {
          id: 'anybody',
          type: 'node',
          options: { type: 'person', attribute: 'name', operator: 'EXISTS' },
        },
      ],
    },
  },
} as unknown as Stage;

const family = {
  id: 'stage-pedigree',
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
} as unknown as Stage;

describe('a family after a creator the walk skipped', () => {
  it('is not squeezed by people that stage will never build', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [seed, skippedBulk, family],
      respectSkipLogicAndFiltering: true,
    });

    // The skipped stage builds nobody, so the whole budget is the family's.
    expect(
      network.nodes.filter((node) => node.stageId === 'stage-skipped'),
    ).toHaveLength(0);
    // Sized so the overcount would leave under a family's own ceiling: with
    // those 9,990 phantom people counted as pending the family was cut to
    // roughly its required core, so anything comfortably above that shows the
    // budget was read correctly.
    expect(network.nodes.length).toBeGreaterThan(20);
  });
});
