import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * A creator the walk passes over hands its planned edges to the next stage
 * that creates the same type, so the declared topology is not simply lost when
 * a guard the plan could not settle turns out to fire.
 *
 * An offer is not an obligation, though. Inherited wholesale, a density-1
 * Sociogram behind such a guard gave its entire edge set to an unguarded
 * density-0.5 one — and the receiving stage could not take the excess back,
 * because those edges arrive already planned rather than drawn from its own
 * target. What a stage ends up holding has to be what its own declaration
 * asks for.
 *
 * The guard here reads an ALTER, not ego, so `planNetwork` cannot settle it
 * and plans the first stage's edges in full; the walk then skips it.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        layout: { name: 'Layout', type: 'layout' },
      },
    },
  },
  edge: {
    knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
  },
} as unknown as StructuralCodebook;

const people = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 6 } },
  behaviours: { minNodes: 6, maxNodes: 6 },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'p1', text: 'Name people' }],
} as unknown as Stage;

/** Density 1 over every pair, behind a guard the plan cannot settle. */
const guardedDense = {
  id: 'stage-dense',
  type: 'Sociogram',
  label: 'Everyone',
  subject: { entity: 'node', type: 'person' },
  synthetic: {
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 1 },
    },
  },
  skipLogic: {
    action: 'SKIP',
    filter: {
      // An alter rule: undecidable before the network exists, so the plan
      // keeps this stage and draws its edges.
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
  prompts: [
    {
      id: 'dense-p',
      text: 'Who knows who?',
      layout: { layoutVariable: 'layout' },
      edges: { create: 'knows' },
    },
  ],
} as unknown as Stage;

/** Asks for half the pairs, and must not end up holding all of them. */
const sparse = {
  id: 'stage-sparse',
  type: 'Sociogram',
  label: 'A few',
  subject: { entity: 'node', type: 'person' },
  synthetic: {
    topology: {
      metric: 'density',
      distribution: { distribution: 'constant', value: 0.5 },
    },
  },
  prompts: [
    {
      id: 'sparse-p',
      text: 'And who else?',
      layout: { layoutVariable: 'layout' },
      edges: { create: 'knows' },
    },
  ],
} as unknown as Stage;

describe('edges inherited from a creator the walk skipped', () => {
  it('never exceed what the inheriting stage declared', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [people, guardedDense, sparse],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(6);
    const knows = network.edges.filter((edge) => edge.type === 'knows').length;
    // Six people span fifteen pairs; the surviving stage asked for half.
    // Inheriting the skipped stage's density-1 set produced all fifteen.
    expect(knows).toBeLessThanOrEqual(8);
  });
});
