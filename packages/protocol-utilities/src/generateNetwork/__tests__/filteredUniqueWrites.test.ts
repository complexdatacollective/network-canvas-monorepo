import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A variable written only behind a filter is left out of the plan and drawn
 * during the walk, against the set the filter really admits. That is right for
 * planning — the plan cannot know a set decided by values it is still drawing.
 * It is not a reason for feasibility to count the write at zero holders: the
 * filter may admit the whole type, and a `unique` variable counted at zero
 * cleared preflight and then ran out of values partway through the walk.
 */

const codebookWith = (options: number) =>
  ({
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        synthetic: { count: { distribution: 'constant', value: 3 } },
        variables: {
          local: {
            name: 'Local',
            type: 'boolean',
            synthetic: { probabilityTrue: 1 },
          },
          flag: {
            name: 'Flag',
            type: 'ordinal',
            options: Array.from({ length: options }, (_, index) => ({
              label: `Flag ${index + 1}`,
              value: index + 1,
            })),
            validation: { unique: true },
          },
        },
      },
    },
    ego: { variables: {} },
    edge: {},
  }) as unknown as StructuralCodebook;

const generator = {
  id: 'ng',
  type: 'NameGeneratorQuickAdd',
  label: 'People',
  subject: { entity: 'node', type: 'person' },
  quickAdd: 'local',
  prompts: [{ id: 'ng-p', text: 'Who?' }],
} as unknown as Stage;

/** A form gated on a NON-unique attribute, so its reach cannot be bounded. */
const filteredForm = {
  id: 'form',
  type: 'AlterForm',
  label: 'About',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'About', fields: [{ variable: 'flag', prompt: 'Flag?' }] },
  filter: {
    join: 'AND',
    rules: [
      {
        id: 'r',
        type: 'node',
        options: {
          type: 'person',
          attribute: 'local',
          operator: 'EXACTLY',
          value: true,
        },
      },
    ],
  },
} as unknown as Stage;

const run = (options: number) =>
  generateNetwork({
    seed: 3,
    codebook: codebookWith(options),
    stages: [generator, filteredForm],
    respectSkipLogicAndFiltering: true,
  });

describe('a unique variable written only behind a filter', () => {
  it('is refused up front when the filter could exhaust it', () => {
    // Two values, three people the filter can admit. The refusal names the
    // problem; the alternative was a run that died on the third draw.
    expect(() => run(2)).toThrow(/only 2 distinct values are possible/);
  });

  it('still generates when the values go round', () => {
    const { network } = run(3);

    expect(network.nodes).toHaveLength(3);
    const flags = network.nodes
      .map((node) => node[entityAttributesProperty].flag)
      .filter((value) => value !== undefined && value !== null);
    expect(new Set(flags).size).toBe(flags.length);
  });
});
