import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * Prompts on one stage creating the same edge type share a single topology
 * target — the stage declared it once, and `topologyKey` is what the plan
 * draws that one target against.
 *
 * Feasibility bounded each CREATION instead, so a stage's prompts each
 * contributed their own share of a target only one of them will spend. Three
 * subjects at density 0.5 can hold two edges however many prompts ask for
 * them; counted per prompt that reads as three, and a `unique` edge variable
 * offering two values was refused for a protocol every seed satisfies.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      color: 'edge-color-seq-1',
      variables: {
        tie: { name: 'Tie', type: 'boolean', validation: { unique: true } },
      },
    },
  },
} as unknown as Codebook;

const people = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 3 } },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
} as unknown as Stage;

/** One census, two prompts, one edge type — and so one shared target. */
const census = {
  id: 'stage-census',
  type: 'TieStrengthCensus',
  label: 'Ties',
  subject: { entity: 'node', type: 'person' },
  synthetic: {
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 0.5 },
    },
  },
  prompts: [
    { id: 'c1', text: 'How close?', createEdge: 'knows', edgeVariable: 'tie' },
    { id: 'c2', text: 'And now?', createEdge: 'knows', edgeVariable: 'tie' },
  ],
} as unknown as Stage;

describe('prompts sharing one topology target', () => {
  it('counts the shared target once when bounding the edge type', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [people, census],
    });

    expect(network.nodes).toHaveLength(3);
    // round(0.5 × 3 pairs) = 2, whichever prompt spends it.
    expect(network.edges.filter((edge) => edge.type === 'knows')).toHaveLength(
      2,
    );
  });
});
