import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

const stage = (value: Record<string, unknown>): Stage =>
  value as unknown as Stage;

const codebook = (variables: Record<string, unknown>): Codebook =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        variables,
      },
    },
    edge: {},
    ego: { variables: {} },
  }) as unknown as Codebook;

const nameGenerator = (): Stage =>
  stage({
    id: 'ng',
    type: 'NameGeneratorQuickAdd',
    label: 'Names',
    subject: { entity: 'node', type: 'person' },
    quickAdd: 'name',
    prompts: [{ id: 'ng-p1', text: 'Who?' }],
    behaviours: { minNodes: 3, maxNodes: 3 },
  });

const alterForm = (id: string, ...variables: string[]): Stage =>
  stage({
    id,
    type: 'AlterForm',
    label: 'About them',
    subject: { entity: 'node', type: 'person' },
    form: { fields: variables.map((variable) => ({ variable, prompt: '?' })) },
  });

const attributesOf = (node: NcNode) => node[entityAttributesProperty];

void entityPrimaryKeyProperty;

describe('a number window holding no integer, with a declared descriptor', () => {
  it('returns a declared constant as written', () => {
    // The declared-constant passthrough (ValueGenerator.ts:497) exempts
    // authored constants from the two-decimal grid — but only in the
    // integer-window branch. A validation window with no integer takes the
    // earlier `max < min` branch, which rounds every draw.
    const { network } = generateNetwork({
      seed: 3,
      codebook: codebook({
        name: { name: 'Name', type: 'text' },
        share: {
          name: 'Share',
          type: 'number',
          validation: { minValue: 10.5, maxValue: 10.7 },
          synthetic: { distribution: 'constant', value: 10.567 },
        },
      }),
      stages: [nameGenerator(), alterForm('form', 'share')],
    });

    expect(network.nodes).toHaveLength(3);
    for (const node of network.nodes) {
      expect(attributesOf(node).share).toBe(10.567);
    }
  });

  it('keeps a declared narrow uniform inside its own window', () => {
    // The narrow-window guard (ValueGenerator.ts:524) skips rounding when the
    // descriptor-narrowed window is below one grid step — but only in the
    // integer-window branch. Here every draw from uniform [10.551, 10.552]
    // must lie inside that declared window.
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = generateNetwork({
        seed,
        codebook: codebook({
          name: { name: 'Name', type: 'text' },
          share: {
            name: 'Share',
            type: 'number',
            validation: { minValue: 10.5, maxValue: 10.7 },
            synthetic: { distribution: 'uniform', min: 10.551, max: 10.552 },
          },
        }),
        stages: [nameGenerator(), alterForm('form', 'share')],
      });

      for (const node of network.nodes) {
        const value = attributesOf(node).share as number;
        expect(value).toBeGreaterThanOrEqual(10.551);
        expect(value).toBeLessThanOrEqual(10.552);
      }
    }
  });
});
