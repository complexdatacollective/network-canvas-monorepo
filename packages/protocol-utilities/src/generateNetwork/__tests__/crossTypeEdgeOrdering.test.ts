import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/** Every eligible pair linked. */
const FULL_DENSITY = {
  topology: {
    metric: 'density',
    distribution: { distribution: 'constant', value: 1 },
  },
};

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
    },
  },
  edge: {
    // `follow` is FIRST creatable at stage 1, so the type-level planning
    // order (sorted by firstEdgeAt) plans ALL of `follow` — including its
    // stage-3 creation — before any `friend` edge exists in the shadow.
    follow: { name: 'Follow', color: 'edge-color-seq-1', variables: {} },
    friend: { name: 'Friend', color: 'edge-color-seq-2', variables: {} },
  },
  ego: { variables: {} },
} as unknown as Codebook;

const stages: Stage[] = [
  stage({
    id: 'ng',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'ng-p1', text: 'Who?' }],
    behaviours: { minNodes: 4, maxNodes: 4 },
  }),
  // Stage 1: creates `follow`, but behind a filter no node can pass, so it
  // links nobody — live and in the plan alike. Its only role is to make
  // `follow`'s FIRST creation earlier than `friend`'s, which pins `follow`
  // to the front of the type-at-a-time planning order.
  stage({
    id: 'soc-follow',
    type: 'Sociogram',
    label: 'Follow (never)',
    subject: { entity: 'node', type: 'person' },
    filter: {
      join: 'AND',
      rules: [
        {
          id: 'r-ghost',
          type: 'node',
          options: { type: 'person', attribute: 'ghost', operator: 'EXISTS' },
        },
      ],
    },
    synthetic: FULL_DENSITY,
    prompts: [
      { id: 'sf-p1', text: 'Who follows whom?', edges: { create: 'follow' } },
    ],
  }),
  // Stage 2: links every pair with `friend`.
  stage({
    id: 'soc-friend',
    type: 'Sociogram',
    label: 'Friends',
    subject: { entity: 'node', type: 'person' },
    synthetic: FULL_DENSITY,
    prompts: [
      { id: 'fr-p1', text: 'Who is friends?', edges: { create: 'friend' } },
    ],
  }),
  // Stage 3: creates `follow` among people with a `friend` edge. By the time
  // this stage runs in a live interview, stage 2 has linked every pair, so
  // the EXISTS filter admits all four people and density 1 links all six
  // pairs.
  stage({
    id: 'census-follow',
    type: 'DyadCensus',
    label: 'Follow census',
    subject: { entity: 'node', type: 'person' },
    filter: {
      join: 'AND',
      rules: [
        {
          id: 'r-friend',
          type: 'edge',
          options: { type: 'friend', operator: 'EXISTS' },
        },
      ],
    },
    synthetic: FULL_DENSITY,
    prompts: [{ id: 'cf-p1', text: 'Follows?', createEdge: 'follow' }],
  }),
];

describe('cross-type edge filters against a type planned later', () => {
  it('plans a later-stage creation against the edges that exist by then', () => {
    const { network } = generateNetwork({
      seed: 11,
      codebook,
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);
    const byType = (type: string) =>
      network.edges.filter((edge) => edge.type === type);

    // Sanity: stage 2 linked every pair.
    expect(byType('friend')).toHaveLength(6);

    // Stage 3's filter admits all four people once stage 2 has run, and its
    // density of 1 links every pair — the live interview produces six
    // `follow` edges here.
    expect(byType('follow')).toHaveLength(6);
  });
});
