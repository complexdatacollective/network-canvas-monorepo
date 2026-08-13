import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * Repro for: the walk re-evaluates a stage's filter between that stage's own
 * writes.
 *
 * Stage 0 creates 3 people with v fixed false. Stage 1 is an AlterForm
 * filtered to `v EXACTLY false` whose form asks [v, w] in that order; the live
 * interface derives its alter set once (v is false on everyone, so all three
 * are presented) and commits both answers of a card atomically. Stage 2 asks v
 * again unconditionally, so the planner's final value for v is drawn from
 * probabilityTrue: 1 (true) and the creation-time false is intermediate.
 *
 * If filteredSubjects is re-run per VariableWrite, landing v = true during
 * stage 1's first write empties the filter for the second write and w is never
 * landed anywhere (it is filtered-only, hence unplanned).
 *
 * Control (verified): swapping the form field order to [w, v] makes this same
 * test pass, pinning the divergence to intra-stage filter re-evaluation.
 */

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        v: {
          name: 'V',
          type: 'boolean',
          synthetic: { probabilityTrue: 1 },
        },
        w: { name: 'W', type: 'text' },
      },
      synthetic: { count: { distribution: 'constant', value: 3 } },
    },
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
    prompts: [
      {
        id: 'ng-p1',
        text: 'Who?',
        additionalAttributes: [{ variable: 'v', value: false }],
      },
    ],
    behaviours: { minNodes: 3, maxNodes: 3 },
  }),
  stage({
    id: 'form-filtered',
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    filter: {
      join: 'AND',
      rules: [
        {
          id: 'r1',
          type: 'node',
          options: {
            type: 'person',
            attribute: 'v',
            operator: 'EXACTLY',
            value: false,
          },
        },
      ],
    },
    form: {
      title: 'About them',
      fields: [
        { variable: 'v', prompt: 'Still close?' },
        { variable: 'w', prompt: 'Notes?' },
      ],
    },
  }),
  stage({
    id: 'form-final',
    type: 'AlterForm',
    label: 'About them again',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Again',
      fields: [{ variable: 'v', prompt: 'Still close?' }],
    },
  }),
];

describe('a filtered stage writing several fields of one card', () => {
  it('lands every field on the subject set resolved at stage entry', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook,
      stages,
      respectSkipLogicAndFiltering: true,
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      const attributes = node[entityAttributesProperty];
      // Final v: rewritten unconditionally by the last stage, drawn true.
      expect(attributes.v).toBe(true);
      // The filtered AlterForm presented every node (v was false when the
      // stage began) and the card commits v and w together, so w must hold
      // an answer on every node it presented.
      expect(attributes.w).toBeDefined();
    }
  });
});
