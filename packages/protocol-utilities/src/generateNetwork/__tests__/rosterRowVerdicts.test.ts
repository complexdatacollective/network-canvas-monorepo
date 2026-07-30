import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import type { EntityConstraints } from '../constraints/types';

/**
 * How many assignments the completability check has been asked about — one per
 * row `createNodesForStage` judges, since its verdict memo is what stands
 * between a pool of hundreds and a search per row per node.
 */
const completability = { checks: 0 };

vi.mock('../constraints/generateEntityAttributes', async () => {
  const actual = await vi.importActual<
    typeof import('../constraints/generateEntityAttributes')
  >('../constraints/generateEntityAttributes');

  return {
    ...actual,
    completionCheckFor: (entity: EntityConstraints) => {
      const check = actual.completionCheckFor(entity);
      return (fixed: Record<string, VariableValue>) => {
        completability.checks += 1;
        return check(fixed);
      };
    },
  };
});

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * A pair a comparator orders inside a range holding no room above 1: a row
 * carrying `age: 1` breaks nothing on its own and leaves the draw nowhere to
 * put `retired`, so the completability check is what turns it away — and every
 * row judged costs exactly one of the checks counted above.
 */
const codebook = {
  node: {
    person: {
      color: 'node-color-seq-1',
      variables: {
        age: {
          name: 'Age',
          type: 'number',
          validation: { minValue: 0, maxValue: 1 },
        },
        retired: {
          name: 'Retired at',
          type: 'number',
          validation: { minValue: 0, maxValue: 1, greaterThanVariable: 'age' },
        },
      },
    },
  },
} as unknown as Codebook;

function rosterStage(count: number): Stage {
  return {
    id: 'stage-roster',
    type: 'NameGeneratorRoster',
    label: 'Roster',
    subject: { entity: 'node', type: 'person' },
    prompts: [{ id: 'p1', text: 'Pick people' }],
    behaviours: { minNodes: count, maxNodes: count },
  } as unknown as Stage;
}

function rowsOf(ages: number[], keyed: (index: number) => string): NcNode[] {
  return ages.map(
    (age, index) =>
      ({
        [entityPrimaryKeyProperty]: keyed(index),
        type: 'person',
        [entityAttributesProperty]: { age },
      }) as unknown as NcNode,
  );
}

function draw(seed: number, count: number, rows: NcNode[]): number[] {
  const { network } = generateNetwork({
    seed,
    codebook,
    stages: [rosterStage(count)],
    externalData: { 'stage-roster': rows },
  });
  return network.nodes.map((node) =>
    Number(node[entityAttributesProperty].age),
  );
}

beforeEach(() => {
  completability.checks = 0;
});

describe('the verdict a roster row is judged by', () => {
  // Three readers each judge a row at most once per run: feasibility's drawable
  // count, which decides how many people the pool can become; its roster/prompt
  // collision counter, which decides whose values can collide with a prompt's;
  // and the stage draw itself. They are separate passes over separate
  // memoisations — the two counters are pure functions with no generation
  // context to hold one — so the whole-run ceiling is three verdicts per row,
  // not one.
  const READERS = 3;

  it('is reached once per row and reader however many nodes are drawn', () => {
    // Ninety rows the draw cannot complete and ten it can. Every node the stage
    // is asked for walks the pool afresh from a fresh random start, so without
    // a memo the rows already turned away are judged again and again — around
    // 176 searches in the draw alone against the 100 a pool of this size can
    // ever need from it.
    const ages = Array.from({ length: 100 }, (_unused, index) =>
      index % 10 === 0 ? 0 : 1,
    );

    for (let seed = 1; seed <= 20; seed++) {
      completability.checks = 0;
      const rows = rowsOf(ages, (index) => `row-${index}`);

      expect(draw(seed, 10, rows)).toHaveLength(10);
      expect(completability.checks).toBeLessThanOrEqual(READERS * rows.length);
    }
  });

  it('belongs to the row rather than to its primary key', () => {
    // Two rows a caller gave one key, one of which the draw can complete. Each
    // is judged on the values it carries, whichever of them the walk reaches
    // first: a verdict standing for the key would answer the second row with
    // the first row's values, drawing the row nothing can complete on the seeds
    // that reach it first and passing over the row the protocol allows on the
    // rest.
    //
    // A ceiling rather than an exact count, because the key is spent once a row
    // carrying it is drawn: the copy left behind is then off the roster
    // altogether, and the draw never asks the rules about it.
    for (let seed = 1; seed <= 20; seed++) {
      completability.checks = 0;
      const rows = rowsOf([1, 0], () => 'shared-key');

      expect(draw(seed, 2, rows), `seed ${seed}`).toEqual([0]);
      expect(completability.checks, `seed ${seed}`).toBeLessThanOrEqual(
        READERS * rows.length,
      );
    }
  });
});
