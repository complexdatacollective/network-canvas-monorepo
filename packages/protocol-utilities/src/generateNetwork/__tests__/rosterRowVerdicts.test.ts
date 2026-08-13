import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Stage, Variables } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../../generateNetwork';
import type { FeasibilityConfig } from '../config';
import { buildEntityConstraints } from '../constraints/buildConstraints';
import {
  nodeCountFor,
  worstCaseEntityCounts,
} from '../constraints/entityCounts';
import type { EntityConstraints } from '../constraints/types';

/**
 * How many assignments the completability check has been asked about — one per
 * row each feasibility reader judges, since its verdict memo is what stands
 * between a pool of hundreds and a search per row per reader.
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

const TODAY = '2026-07-27';

/**
 * A pair a comparator orders inside a range holding no room above 1: a row
 * carrying `age: 1` breaks nothing on its own and leaves the draw nowhere to
 * put `retired`, so the completability check is what feasibility's counting
 * turns it away by — and every row judged costs exactly one of the checks
 * counted above per reader.
 */
const variables: Variables = {
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
} as unknown as Variables;

const codebook = {
  node: {
    person: { color: 'node-color-seq-1', variables },
  },
} as unknown as Codebook;

const feasibilityConfig: FeasibilityConfig = {
  nodeCount: { min: 1, max: 8 },
  rosterDrawRatio: 0.7,
  sociogramEdgeProbability: { min: 0.3, max: 0.5 },
  censusEdgeProbability: { min: 0.4, max: 0.6 },
  networkComposerEdgeProbability: { min: 0.05, max: 0.1 },
  familyPedigreeNodeCount: { min: 4, max: 10 },
  today: TODAY,
};

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

beforeEach(() => {
  completability.checks = 0;
});

describe('the verdict a roster row is judged by', () => {
  // The readers judging a row are feasibility's — the drawable count, which
  // decides how many people the pool can become, and the collision counters,
  // which decide whose values can meet a prompt's — and the planner's roster
  // assignment, which decides which of a contested pool's rows each stage gets
  // first refusal on. Each is a separate pass over a separate memoisation, so
  // the whole-run ceiling is a few verdicts per row — never one per row per
  // node the stage is asked for, which is the guarantee this bounds.
  const READERS = 4;

  it('is reached once per row and reader however many nodes are drawn', () => {
    // Ninety rows the draw cannot complete and ten it can. Without a per-row
    // memo inside each reader, the rows already turned away would be judged
    // again for every node the stage can hold.
    const ages = Array.from({ length: 100 }, (_unused, index) =>
      index % 10 === 0 ? 0 : 1,
    );

    for (let seed = 1; seed <= 20; seed++) {
      completability.checks = 0;
      const rows = rowsOf(ages, (index) => `row-${index}`);

      const { network } = generateNetwork({
        seed,
        codebook,
        stages: [rosterStage(10)],
        externalData: { 'stage-roster': rows },
      });

      expect(network.nodes).toHaveLength(10);
      expect(completability.checks).toBeLessThanOrEqual(READERS * rows.length);
    }
  });

  it('belongs to the row rather than to its primary key', () => {
    // Two rows a caller gave one key, only one of which the draw can complete.
    // Feasibility judges each on the values it carries: a verdict standing for
    // the key would answer the second row with the first row's values, and
    // with the uncompletable row listed first the key would count for nobody —
    // under-counting a person the run really can build, which is the direction
    // that lets a `unique` refusal be skipped.
    const entity = buildEntityConstraints(variables, TODAY);
    const counts = worstCaseEntityCounts(
      [rosterStage(2)],
      feasibilityConfig,
      { 'stage-roster': rowsOf([1, 0], () => 'shared-key') },
      () => entity,
    );

    // One key, one drawable row under it: one person.
    expect(nodeCountFor(counts.node, 'person', ['age'])).toBe(1);
    expect(completability.checks).toBeLessThanOrEqual(READERS * 2);
  });
});
