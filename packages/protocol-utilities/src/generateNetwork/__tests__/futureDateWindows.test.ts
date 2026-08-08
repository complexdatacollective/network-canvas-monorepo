import { describe, expect, it } from 'vitest';

import { entityAttributesProperty } from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * A date picker with no authored bounds still arrives with a ceiling: today,
 * standing in for the bound the protocol did not write. At full resolution
 * nothing validates above it — the control simply stops offering later dates —
 * so a synthetic window asking for future dates is not in conflict with a
 * rule, and answering it with the recent past inverts the declaration.
 */

const TODAY = '2026-08-07';

type Synthetic = Record<string, unknown>;

const datesFor = (synthetic: Synthetic, parameters?: Synthetic): string[] => {
  const { network } = generateNetwork({
    seed: 3,
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
              ...(parameters ? { parameters } : {}),
              synthetic,
            },
          },
        },
      },
      edge: {},
    } as never,
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
    ] as never,
  });

  return network.nodes.map(
    (node) => node[entityAttributesProperty].met as string,
  );
};

describe('a synthetic date window above the stand-in ceiling', () => {
  it('honours a one-sided future floor', () => {
    const dates = datesFor({ distribution: 'uniform', min: '2030-01-01' });

    expect(dates).toHaveLength(5);
    for (const date of dates) {
      expect(date >= '2030-01-01').toBe(true);
    }
  });

  it('honours a future floor and ceiling together', () => {
    const dates = datesFor({
      distribution: 'uniform',
      min: '2030-01-01',
      max: '2035-01-01',
    });

    expect(dates).toHaveLength(5);
    for (const date of dates) {
      expect(date >= '2030-01-01' && date <= '2035-01-01').toBe(true);
    }
  });

  it('leaves a past floor drawing where it always did', () => {
    const dates = datesFor({ distribution: 'uniform', min: '1950-01-01' });

    expect(dates).toHaveLength(5);
    for (const date of dates) {
      expect(date >= '1950-01-01' && date <= TODAY).toBe(true);
    }
  });

  it('centres an unbounded normal on its declared mean', () => {
    // A normal names no bounds of its own, only a centre. Where the field
    // declares none either, the stand-in window has to reach that centre —
    // cut off at today, a mean of 2030 came back as today's date.
    const dates = datesFor({
      distribution: 'normal',
      mean: '2030-01-01',
      sdDays: 0,
    });

    expect(dates).toHaveLength(5);
    for (const date of dates) expect(date).toBe('2030-01-01');
  });

  it('centres an unbounded normal on an old mean too', () => {
    const dates = datesFor({
      distribution: 'normal',
      mean: '1950-06-15',
      sdDays: 0,
    });

    for (const date of dates) expect(date).toBe('1950-06-15');
  });

  it('still yields to a ceiling the protocol declared', () => {
    // An authored `max` is a rule the interview validates against, so a
    // synthetic window above it is the disjoint case: the descriptor is
    // dropped and the field's own window drawn from.
    const dates = datesFor(
      { distribution: 'uniform', min: '2030-01-01' },
      { max: '2020-01-01' },
    );

    expect(dates).toHaveLength(5);
    for (const date of dates) {
      expect(date <= '2020-01-01').toBe(true);
    }
  });
});
