import { describe, expect, it } from 'vitest';

import {
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';

/**
 * Roster rows are drawn without replacement across the whole run, so two
 * roster stages pointed at one pool describe the same people twice over — not
 * twice as many people. Apportionment has to see that, because a share handed
 * to a stage with nobody left to offer is not passed on to a stage that could
 * have filled it: it goes unbuilt, and the declared population silently
 * arrives short.
 */

const rows = [
  {
    [entityPrimaryKeyProperty]: 'p1',
    type: 'person',
    attributes: { name: 'Ada' },
  },
  {
    [entityPrimaryKeyProperty]: 'p2',
    type: 'person',
    attributes: { name: 'Bo' },
  },
] as unknown as NcNode[];

const rosterStage = (id: string) => ({
  id,
  type: 'NameGeneratorRoster',
  label: id,
  subject: { entity: 'node', type: 'person' },
  dataSource: id,
  cardOptions: { displayLabel: 'name' },
  prompts: [{ id: `${id}-p`, text: 'Pick people' }],
});

const populationOf = (seed: number): number => {
  const { network } = generateNetwork({
    seed,
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          synthetic: { count: { distribution: 'constant', value: 4 } },
          variables: { name: { name: 'Name', type: 'text' } },
        },
      },
      edge: {},
    } as never,
    stages: [
      rosterStage('roster-a'),
      rosterStage('roster-b'),
      {
        id: 'gen',
        type: 'NameGenerator',
        label: 'More',
        subject: { entity: 'node', type: 'person' },
        form: {
          title: 'About this person',
          fields: [{ variable: 'name', prompt: 'Name' }],
        },
        prompts: [{ id: 'gen-p', text: 'Name more people' }],
      },
    ] as never,
    externalData: { 'roster-a': rows, 'roster-b': rows },
  });

  return network.nodes.length;
};

describe('two roster stages over one pool', () => {
  it('still builds the declared population', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(populationOf(seed), `seed ${seed}`).toBe(4);
    }
  });

  it('uses each roster person once', () => {
    const { network } = generateNetwork({
      seed: 1,
      codebook: {
        node: {
          person: {
            name: 'Person',
            color: 'node-color-seq-1',
            synthetic: { count: { distribution: 'constant', value: 4 } },
            variables: { name: { name: 'Name', type: 'text' } },
          },
        },
        edge: {},
      } as never,
      stages: [rosterStage('roster-a'), rosterStage('roster-b')] as never,
      externalData: { 'roster-a': rows, 'roster-b': rows },
    });

    const names = network.nodes.map(
      (node) => node.attributes.name as VariableValue,
    );
    expect(new Set(names).size).toBe(names.length);
  });
});
