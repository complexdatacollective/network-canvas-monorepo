import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A variable declared missing on every entity holds no values, and the
 * runtime's own `unique` validator exempts empty ones — "required owns
 * emptiness; uniqueness begins only once a value is supplied". Drawing values
 * for it anyway spends the run's unique registry on values that are then
 * thrown away, and counting its value space against the entities carrying it
 * refuses a protocol whose finished session would hold nothing at all.
 */

const runWith = (
  missingProbability: number,
  count: number,
  validation: Record<string, unknown> = { unique: true },
) =>
  generateNetwork({
    seed: 2,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          variables: {
            flag: {
              name: 'Flag',
              type: 'boolean',
              validation,
              synthetic: { probabilityTrue: 0.5, missingProbability },
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
        synthetic: { count: { distribution: 'constant', value: count } },
        form: {
          title: 'About this person',
          fields: [{ variable: 'flag', prompt: 'Flag' }],
        },
        prompts: [{ id: 'p1', text: 'Name people' }],
      },
    ] as unknown as Stage[],
  });

describe('a unique variable that is certainly missing', () => {
  it('generates more entities than its value space holds', () => {
    // Three people, a two-valued boolean, and every value unanswered.
    const { network } = runWith(1, 3);

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(node[entityAttributesProperty].flag).toBeNull();
    }
  });

  it('still refuses the same shape when values are drawn', () => {
    // Nothing declared missing: three people really do need three distinct
    // boolean values, and two is all there are.
    expect(() => runWith(0, 3)).toThrow(/unique/i);
  });

  it('still refuses when missingness is merely likely', () => {
    // Short of certainty every entity may end up answering, so the values
    // still have to exist.
    expect(() => runWith(0.99, 3)).toThrow(/unique/i);
  });
});
