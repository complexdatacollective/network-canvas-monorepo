import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A stage's prompts are separate screens shown in order, and the interview's
 * filtered network is a LIVE selector (`getFilteredNetwork` over `getNetwork`)
 * — so the set a prompt is shown reflects everything its predecessors did.
 *
 * Materialisation grouped a stage's effects by operation instead: every edge
 * the stage creates, then every value it writes. A Sociogram that highlights
 * people at prompt 0 and links them at prompt 1 therefore linked them first
 * and judged the highlight against a network that already held prompt 1's
 * edges — the reverse of what the participant did.
 *
 * The people here come from a FamilyPedigree, which builds its family during
 * the walk rather than in the plan. That is what makes the divergence visible:
 * the plan holds no domain over pedigree people, so the walk applies the
 * declared topology itself and evaluates the stage filter AT THAT MOMENT —
 * unlike an edge the plan already settled, which is not re-judged at the stage
 * that planned it.
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
        seen: { name: 'Seen', type: 'boolean' },
        layout: { name: 'Layout', type: 'layout' },
      },
    },
  },
  edge: {
    knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
  },
} as unknown as Codebook;

const pedigree = {
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

/**
 * Prompt 0 marks everyone it is shown; prompt 1 links whoever is still
 * unmarked. The stage filter admits only people carrying no mark, so once
 * prompt 0 has run there is nobody left for prompt 1 to link.
 */
const markThenLink = {
  id: 'stage-sociogram',
  type: 'Sociogram',
  label: 'Mark, then link',
  subject: { entity: 'node', type: 'person' },
  synthetic: {
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 1 },
    },
  },
  filter: {
    join: 'AND',
    rules: [
      {
        id: 'r-unseen',
        type: 'node',
        options: { type: 'person', attribute: 'seen', operator: 'NOT_EXISTS' },
      },
    ],
  },
  prompts: [
    {
      id: 'p-mark',
      text: 'Who have you seen recently?',
      layout: { layoutVariable: 'layout' },
      highlight: { allowHighlighting: true, variable: 'seen' },
    },
    {
      id: 'p-link',
      text: 'Who knows who?',
      layout: { layoutVariable: 'layout' },
      edges: { create: 'knows' },
    },
  ],
} as unknown as Stage;

describe('a stage whose prompts change what the next prompt is shown', () => {
  it('links nobody once an earlier prompt has excluded everyone', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [pedigree, markThenLink],
        respectSkipLogicAndFiltering: true,
      });

      // The family is built, and prompt 0 reaches all of it: nobody carries
      // `seen` when that screen is presented.
      expect(network.nodes.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const node of network.nodes) {
        expect(
          node[entityAttributesProperty].seen,
          `seed ${seed}`,
        ).toBeDefined();
      }

      // And so prompt 1 is shown an empty canvas. Replayed with every edge
      // creation ahead of every write, this stage linked the whole family at
      // density 1 before the mark that excludes them was written.
      expect(
        network.edges.filter((edge) => edge.type === 'knows'),
        `seed ${seed}`,
      ).toHaveLength(0);
    }
  });
});
