import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * A degenerate distribution has single-point support, and feasibility has to
 * count against that support rather than against the bound the sampler clamps
 * into. The two readings only differ here — everywhere else a clamp IS the
 * ceiling — which is exactly why they drifted apart: `syntheticCountCeiling`
 * answers "what does `sampleCount` clamp to", `syntheticCountSupport` answers
 * "what can this declaration actually land on", and preflight was asking the
 * first while meaning the second.
 *
 * Both are now derived once, in `@codaco/protocol-validation`, beside the
 * schemas that admit them.
 */

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

describe('feasibility counts a degenerate declaration at its real support', () => {
  it('accepts a zero-deviation count whose clamp is far above its mean', () => {
    // `{ mean: 1, sd: 0, max: 20 }` always builds ONE person: the maximum is a
    // clamp that can never bind. Counted at 20, preflight refused the `unique`
    // boolean — two values for twenty people — for nineteen people the run
    // never creates.
    const codebook = {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            flag: {
              name: 'Flag',
              type: 'boolean',
              validation: { unique: true },
            },
          },
        },
      },
      edge: {},
    } as unknown as Codebook;

    const generator = {
      id: 'stage-people',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      synthetic: {
        count: { distribution: 'normal', mean: 1, sd: 0, max: 20 },
      },
      form: { title: 'About', fields: [{ variable: 'flag', prompt: 'Flag?' }] },
      prompts: [{ id: 'p1', text: 'Name people' }],
    } as unknown as Stage;

    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [generator],
    });

    expect(network.nodes).toHaveLength(1);
  });

  it('accepts a zero-deviation beta density whose domain is the whole graph', () => {
    // Four people span six pairs, but `{ beta, mean: 0.1, sd: 0 }` always
    // draws 0.1 — one edge. Counted over the whole domain, preflight refused
    // the `unique` boolean for five edges the run never draws.
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

    const stages = [
      {
        id: 'stage-people',
        type: 'NameGenerator',
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        synthetic: { count: { distribution: 'constant', value: 4 } },
        form: {
          title: 'About',
          fields: [{ variable: 'name', prompt: 'Name' }],
        },
        prompts: [{ id: 'p1', text: 'Name people' }],
      },
      {
        id: 'stage-census',
        type: 'TieStrengthCensus',
        label: 'Ties',
        subject: { entity: 'node', type: 'person' },
        synthetic: {
          topology: {
            metric: 'density',
            distribution: { distribution: 'beta', mean: 0.1, sd: 0 },
          },
        },
        prompts: [
          {
            id: 'c1',
            text: 'How close?',
            createEdge: 'knows',
            edgeVariable: 'tie',
          },
        ],
      },
    ] as unknown as Stage[];

    const { network } = generateNetwork({ seed: 1, codebook, stages });

    expect(network.nodes).toHaveLength(4);
    // round(0.1 × 6 pairs) = 1.
    expect(network.edges.filter((edge) => edge.type === 'knows')).toHaveLength(
      1,
    );
  });
});
