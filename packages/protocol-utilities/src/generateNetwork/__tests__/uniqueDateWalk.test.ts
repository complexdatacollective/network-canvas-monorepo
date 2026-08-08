import { describe, expect, it } from 'vitest';

import type { Stage, StructuralCodebook } from '@codaco/protocol-validation';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A `unique` variable is walked rather than sampled: the sequence has to reach
 * as many distinct values as there are entities, which is what feasibility
 * counted before the run started. Feasibility counts the FIELD's window, so
 * the walk has to take that window too — walking the descriptor's instead let
 * a narrow synthetic window repeat its way through the registry after
 * preflight had promised room. The number branch has always worked this way;
 * realism yields to satisfiability wherever the two disagree.
 */

const TODAY = '2026-08-07';

const datesFor = (
  synthetic: Record<string, unknown>,
  count: number,
  parameters?: Record<string, unknown>,
): string[] => {
  const { network } = generateNetwork({
    seed: 2,
    config: { today: TODAY },
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          synthetic: { count: { distribution: 'constant', value: count } },
          variables: {
            met: {
              name: 'Met',
              type: 'datetime',
              component: 'DatePicker',
              ...(parameters ? { parameters } : {}),
              validation: { unique: true },
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
        form: {
          title: 'About this person',
          fields: [{ variable: 'met', prompt: 'When did you meet?' }],
        },
        prompts: [{ id: 'p1', text: 'Name people' }],
      },
    ] as unknown as Stage[],
  });

  return network.nodes.map(
    (node) => node[entityAttributesProperty].met as string,
  );
};

describe('a unique datetime under a narrow synthetic window', () => {
  it('reaches distinct values past the descriptor window', () => {
    // The descriptor pins a single day; four people still need four dates.
    const dates = datesFor(
      { distribution: 'uniform', min: '2020-01-01', max: '2020-01-01' },
      4,
    );

    expect(dates).toHaveLength(4);
    expect(new Set(dates).size).toBe(4);
  });

  it('stays inside a window the field itself declares', () => {
    // The field's bounds are a rule, not a stand-in, so the walk is held to
    // them however many entities are asking.
    const dates = datesFor(
      { distribution: 'uniform', min: '2020-06-01', max: '2020-06-02' },
      5,
      { min: '2019-01-01', max: '2021-12-31' },
    );

    expect(new Set(dates).size).toBe(5);
    for (const date of dates) {
      expect(date >= '2019-01-01' && date <= '2021-12-31').toBe(true);
    }
  });

  it('still shapes a non-unique draw by the descriptor', () => {
    // Only the `unique` walk sets the descriptor aside. An ordinary draw is
    // still the declared window's.
    const { network } = generateNetwork({
      seed: 2,
      config: { today: TODAY },
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 5 } },
            variables: {
              met: {
                name: 'Met',
                type: 'datetime',
                component: 'DatePicker',
                synthetic: {
                  distribution: 'uniform',
                  min: '2020-01-01',
                  max: '2020-01-31',
                },
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
          form: {
            title: 'About this person',
            fields: [{ variable: 'met', prompt: 'When did you meet?' }],
          },
          prompts: [{ id: 'p1', text: 'Name people' }],
        },
      ] as unknown as Stage[],
    });

    for (const node of network.nodes) {
      const met = node[entityAttributesProperty].met as string;
      expect(met >= '2020-01-01' && met <= '2020-01-31').toBe(true);
    }
  });
});
