import { describe, expect, it } from 'vitest';

import {
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import { SyntheticDataConstraintError } from '../constraints/error';

/**
 * Roster rows are drawn without replacement across the whole run, so two
 * roster stages pointed at one pool describe the same people twice over — not
 * twice as many people.
 *
 * Counts are declared by the stages themselves, so this is no longer a
 * negotiation over how many people each stage gets, only an assignment of
 * which rows go where. Two things follow, and this file guards both: the
 * assignment has to serve the most constrained pool first, or a wide pool
 * takes rows the only stage that could have used them still needed; and a pool
 * that genuinely cannot cover its stages has to say so, because silently
 * building fewer people is how an under-provisioned roster went unnoticed.
 */

const poolOf = (...ids: string[]): NcNode[] =>
  ids.map((id) => ({
    [entityPrimaryKeyProperty]: id,
    type: 'person',
    attributes: { name: `Person ${id}` },
  })) as unknown as NcNode[];

const rosterStage = (id: string, count: number) => ({
  id,
  type: 'NameGeneratorRoster',
  label: id,
  subject: { entity: 'node', type: 'person' },
  synthetic: { count: { distribution: 'constant', value: count } },
  dataSource: id,
  cardOptions: { displayLabel: 'name' },
  prompts: [{ id: `${id}-p`, text: 'Pick people' }],
});

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: { name: { name: 'Name', type: 'text' } },
    },
  },
  edge: {},
} as never;

const run = (
  stages: ReturnType<typeof rosterStage>[],
  externalData: Record<string, NcNode[]>,
  seed = 1,
) => generateNetwork({ seed, codebook, stages: stages as never, externalData });

describe('two roster stages over one pool', () => {
  it('builds every person each stage declared, using nobody twice', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = run(
        [rosterStage('roster-a', 2), rosterStage('roster-b', 2)],
        {
          'roster-a': poolOf('p1', 'p2', 'p3', 'p4'),
          'roster-b': poolOf('p1', 'p2', 'p3', 'p4'),
        },
        seed,
      );

      expect(network.nodes, `seed ${seed}`).toHaveLength(4);
      const names = network.nodes.map(
        (node) => node.attributes.name as VariableValue,
      );
      expect(new Set(names).size, `seed ${seed}`).toBe(names.length);
    }
  });
});

describe('roster pools of different widths over the same people', () => {
  it('serves the narrow pool first, so both stages are filled', () => {
    // The case that motivated most-constrained-first. Four rows are offered to
    // one stage and only two of them to the other, and two people are wanted
    // from each — satisfiable exactly one way. Served in stage order, the wide
    // stage takes p1 and p2 and the narrow stage is left with nothing.
    for (let seed = 1; seed <= 10; seed++) {
      const { network } = run(
        [rosterStage('wide', 2), rosterStage('narrow', 2)],
        {
          wide: poolOf('p1', 'p2', 'p3', 'p4'),
          narrow: poolOf('p1', 'p2'),
        },
        seed,
      );

      expect(network.nodes, `seed ${seed}`).toHaveLength(4);
    }
  });

  it('fills the narrow stage from the rows only it can reach', () => {
    const { network } = run(
      [rosterStage('wide', 2), rosterStage('narrow', 2)],
      {
        wide: poolOf('p1', 'p2', 'p3', 'p4'),
        narrow: poolOf('p1', 'p2'),
      },
    );

    const fromNarrow = network.nodes
      .filter((node) => node.stageId === 'narrow')
      .map((node) => node[entityPrimaryKeyProperty]);
    expect(fromNarrow).toHaveLength(2);
    expect(new Set(fromNarrow)).toEqual(new Set(['p1', 'p2']));
  });
});

describe('a roster that cannot cover the stages drawing from it', () => {
  it('refuses, rather than quietly building fewer people', () => {
    const attempt = () =>
      run([rosterStage('roster-a', 2), rosterStage('roster-b', 2)], {
        'roster-a': poolOf('p1', 'p2'),
        'roster-b': poolOf('p1', 'p2'),
      });

    expect(attempt).toThrow(SyntheticDataConstraintError);
    // Named specifically: an exhaustion refusal raised while DRAWING says a
    // value space ran out, which is a different thing to tell a researcher.
    expect(attempt).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('names the stage that came up short and what it was set to add', () => {
    try {
      run([rosterStage('roster-a', 2), rosterStage('roster-b', 2)], {
        'roster-a': poolOf('p1', 'p2'),
        'roster-b': poolOf('p1', 'p2'),
      });
      expect.unreachable('expected the run to refuse');
    } catch (error) {
      expect(error).toBeInstanceOf(SyntheticDataConstraintError);
      const [conflict] = (error as SyntheticDataConstraintError).conflicts;
      expect(conflict?.entity).toBe('node');
      expect(conflict?.entityTypeName).toBe('Person');
      expect(conflict?.reason).toMatch(/roster-[ab]/);
      expect(conflict?.reason).toMatch(/set to add 2/);
    }
  });

  it('refuses a single stage asking for more than its own pool', () => {
    expect(() =>
      run([rosterStage('roster-a', 5)], { 'roster-a': poolOf('p1', 'p2') }),
    ).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('takes what an undeclared stage pool offers rather than refusing', () => {
    // The rule is about INTENT. A stage carrying only the generic 1-8 fallback
    // has said nothing about this roster, so a pool smaller than the fallback
    // is not a mistake to report — the real Development Protocol has six
    // classmates and a stage the default would have asked eight of.
    const undeclared = {
      id: 'roster-a',
      type: 'NameGeneratorRoster',
      label: 'roster-a',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'roster-a',
      cardOptions: { displayLabel: 'name' },
      prompts: [{ id: 'roster-a-p', text: 'Pick people' }],
    } as ReturnType<typeof rosterStage>;

    for (let seed = 1; seed <= 10; seed++) {
      const { network } = run(
        [undeclared],
        { 'roster-a': poolOf('p1', 'p2') },
        seed,
      );
      expect(network.nodes.length, `seed ${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it('still refuses when the stage declared the count itself', () => {
    // The same pool, the same shortfall — reported because the author wrote it.
    expect(() =>
      run([rosterStage('roster-a', 5)], { 'roster-a': poolOf('p1', 'p2') }),
    ).toThrow(
      /roster does not hold enough people for the stages drawing from it/,
    );
  });

  it('builds nothing but refuses nothing for a known-empty roster', () => {
    // An empty pool with a zero count is coherent: the roster resolved and had
    // no rows, and the stage was not asked to add anybody.
    const { network } = run([rosterStage('roster-a', 0)], {
      'roster-a': [],
    });
    expect(network.nodes).toHaveLength(0);
  });
});
