import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * A value the creating interaction fixes, rewritten by a later form whose
 * answer is declared certainly missing. The session shows THREE states in
 * order: nothing before creation, `true` from creation until the form, and
 * nothing after it — and both passes have to honour the middle one as well as
 * the last.
 */
const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        flag: {
          name: 'Flag',
          type: 'boolean',
          synthetic: { missingProbability: 1 },
        },
      },
    },
  },
  edge: {
    knows: { name: 'Knows', color: 'edge-color-seq-1', variables: {} },
  },
} as unknown as Codebook;

const generator = {
  id: 'stage-people',
  type: 'NameGenerator',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 4 } },
  behaviours: { minNodes: 4, maxNodes: 4 },
  form: { title: 'About', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [
    {
      id: 'p1',
      text: 'Name people',
      additionalAttributes: [{ variable: 'flag', value: true }],
    },
  ],
} as unknown as Stage;

const filteredCensus = {
  id: 'stage-census',
  type: 'DyadCensus',
  label: 'Census',
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
        id: 'flagged',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'flag',
          operator: 'EXACTLY',
          value: true,
        },
      },
    ],
  },
  prompts: [
    { id: 'c1', text: 'Do they know each other?', createEdge: 'knows' },
  ],
} as unknown as Stage;

const rewritingForm = {
  id: 'stage-form',
  type: 'AlterForm',
  label: 'About each person',
  subject: { entity: 'node', type: 'person' },
  form: { fields: [{ variable: 'flag', prompt: 'Flag?' }] },
} as unknown as Stage;

describe('a creation-fixed value whose rewrite is planned missing', () => {
  it('shows the fixed value to stages between creation and rewrite', () => {
    // The final value is planned MISSING, so the fixed `true` is absent from
    // the final attributes — but the live session holds it at the census,
    // which stands before the rewriting form. Projecting from the final keys
    // alone excluded every person from the filter and planned no edges.
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [generator, filteredCensus, rewritingForm],
        respectSkipLogicAndFiltering: true,
      });

      expect(network.nodes, `seed ${seed}`).toHaveLength(4);
      // Density 1 over all four people: every pair, because the census sees
      // each of them carrying the creation-fixed flag.
      expect(network.edges.length, `seed ${seed}`).toBe(6);
    }
  });

  it('removes the fixed value where the rewrite lands as missing', () => {
    // The rewriting form is where the participant leaves the question
    // unanswered, so the finished network must not keep the creation-time
    // `true` — that is an answer the declared missingness removed.
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [generator, filteredCensus, rewritingForm],
        respectSkipLogicAndFiltering: true,
      });

      for (const node of network.nodes) {
        expect(
          node[entityAttributesProperty],
          `seed ${seed}`,
        ).not.toHaveProperty('flag');
      }
    }
  });

  it('keeps the fixed value where nothing rewrites it', () => {
    // Without the form the creation-time value IS the final value: deleting
    // on a missing rewrite must not disturb the never-rewritten case.
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [generator, filteredCensus],
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(4);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty].flag).toBe(true);
    }
    expect(network.edges.length).toBe(6);
  });
});
