import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

/**
 * The counterpart of `sameSubjectTopologyCeiling`, and the reason feasibility
 * cannot simply sum.
 *
 * The plan settles each creation over the domain accumulated so far and tops
 * up to that creation's target. Two stages whose filters admit DIFFERENT
 * people therefore build two separate sets of edges — which is what that other
 * test pins — while two stages over the SAME domain top up to one level and
 * build one set between them. Summed regardless, the second stage's target was
 * counted a second time and a `unique` edge variable was refused for edges no
 * seed produces.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      variables: {
        band: {
          name: 'Band',
          type: 'ordinal',
          options: [1, 2, 3, 4].map((value) => ({
            label: `Band ${value}`,
            value,
          })),
          validation: { unique: true },
        },
        layout: { name: 'Layout', type: 'layout' },
      },
    },
  },
  edge: {
    knows: {
      name: 'Knows',
      variables: {
        // Exactly one value, so the protocol is generatable only while the
        // run makes at most one edge.
        marker: {
          name: 'Marker',
          type: 'ordinal',
          options: [{ label: 'Only value', value: 1 }],
          validation: { unique: true },
        },
      },
    },
  },
} as unknown as StructuralCodebook;

const people = {
  id: 'people',
  type: 'NameGeneratorQuickAdd',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'band',
  prompts: [{ id: 'people-prompt', text: 'Who?' }],
  synthetic: { count: { distribution: 'constant', value: 4 } },
} as unknown as Stage;

/** Two sociograms over one subject, both unfiltered — so one pair domain. */
const sociogram = (id: string): Stage =>
  ({
    id,
    type: 'Sociogram',
    label: id,
    subject: { entity: 'node', type: 'person' },
    prompts: [
      {
        id: `${id}-prompt`,
        text: 'Link them',
        layout: { layoutVariable: 'layout' },
        edges: { create: 'knows' },
      },
    ],
    synthetic: {
      topology: {
        metric: 'meanDegree',
        distribution: { distribution: 'constant', value: 0.5 },
      },
    },
  }) as unknown as Stage;

describe('stages sharing one pair domain', () => {
  it('counts their shared target once, and generates', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages: [people, sociogram('first'), sociogram('second')],
      respectSkipLogicAndFiltering: true,
    });

    // Both stages top up to the same level, so the run holds one edge and the
    // single available `marker` value is enough.
    expect(network.edges.filter((edge) => edge.type === 'knows')).toHaveLength(
      1,
    );
  });
});
