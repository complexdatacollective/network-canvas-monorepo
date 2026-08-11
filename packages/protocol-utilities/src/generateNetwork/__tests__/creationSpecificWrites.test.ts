import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * Two stages create the same node type but write different things when they
 * do. A value only one of them collects belongs to the people that one made:
 * drawing it for the whole type spends `unique` values on entities the
 * session never writes it to, and can exhaust a space feasibility sized to
 * the creator alone.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        name: { name: 'Name', type: 'text' },
        // Two values, and only the quick-add stage asks for it.
        flag: {
          name: 'Flag',
          type: 'boolean',
          validation: { unique: true },
        },
      },
    },
  },
  ego: { variables: {} },
  edge: {},
} as unknown as StructuralCodebook;

/** Collects `flag` on the two people it adds. */
const flagCreator = {
  id: 'ng-flag',
  type: 'NameGenerator',
  label: 'Flagged',
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: 3 } },
  form: {
    title: 'About',
    fields: [{ variable: 'flag', prompt: 'Flag?' }],
  },
  prompts: [{ id: 'flag-p', text: 'Who?' }],
  behaviours: { minNodes: 2, maxNodes: 2 },
} as unknown as Stage;

/** Adds one more person and never asks about `flag`. */
const plainCreator = {
  id: 'ng-plain',
  type: 'NameGeneratorQuickAdd',
  label: 'Others',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'name',
  prompts: [{ id: 'plain-p', text: 'Who else?' }],
  behaviours: { minNodes: 1, maxNodes: 1 },
} as unknown as Stage;

describe('a creation-time value only one creator collects', () => {
  it('is drawn for that creator’s people alone', () => {
    const { network } = generateNetwork({
      seed: 2,
      codebook,
      stages: [flagCreator, plainCreator],
    });

    expect(network.nodes).toHaveLength(3);

    const flagged = network.nodes.filter(
      (node) => node[entityAttributesProperty].flag !== undefined,
    );
    // Only the two the flag stage made carry it, and they differ.
    expect(flagged).toHaveLength(2);
    expect(
      new Set(flagged.map((node) => node[entityAttributesProperty].flag)).size,
    ).toBe(2);
  });
});
