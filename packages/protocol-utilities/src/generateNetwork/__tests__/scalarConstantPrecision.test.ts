import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

const scoresFor = (synthetic: Record<string, unknown>): number[] => {
  const { network } = generateNetwork({
    seed: 5,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            score: {
              name: 'Score',
              type: 'scalar',
              component: 'VisualAnalogScale',
              synthetic,
            },
          },
        },
      },
      ego: { variables: {} },
      edge: {},
    } as unknown as StructuralCodebook,
    stages: [
      {
        id: 's1',
        type: 'NameGenerator',
        label: 'People',
        subject: { entity: 'node', type: 'person' },
        synthetic: { count: { distribution: 'constant', value: 6 } },
        form: {
          title: 'About this person',
          fields: [{ variable: 'score', prompt: 'Score' }],
        },
        prompts: [{ id: 'p1', text: 'Name people' }],
      },
    ] as unknown as Stage[],
  });

  return network.nodes.map(
    (node) => node[entityAttributesProperty].score as number,
  );
};

describe('a declared scalar constant', () => {
  it('is returned as written, not rounded to the two-decimal grid', () => {
    // scalarConstantSchema accepts any float in [0, 1]; the live
    // VisualAnalogScale steps by 0.001, so 0.555 is collectable. Rounding a
    // declared constant to 0.56 silently changes the authored value.
    const scores = scoresFor({ distribution: 'constant', value: 0.555 });

    expect(scores).toHaveLength(6);
    for (const score of scores) {
      expect(score).toBe(0.555);
    }
  });
});
