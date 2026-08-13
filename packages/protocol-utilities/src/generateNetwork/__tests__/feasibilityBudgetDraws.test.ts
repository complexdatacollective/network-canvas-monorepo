import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { generateNetwork } from '../../generateNetwork';

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

/**
 * Repro for: feasibility apportions the shared population budget over count
 * CEILINGS while the planner apportions sampled DRAWS, so a later stage's
 * feasibility cap (used to size unique-value demand) is not an upper bound on
 * the population the planner actually gives that stage.
 *
 * Stage 1's normal count has ceiling 10000 (= max) so preflight assigns it the
 * whole 10000 budget and stage 2 gets a cap of 0 — zero worst-case holders of
 * the unique boolean `flag`, so preflight passes. The planner instead spends
 * stage 1's DRAW (~N(9999, 500), clamped to [0, 10000]) and hands stage 2 the
 * remainder: a seed drawing 10000 leaves stage 2 empty and succeeds, while a
 * seed drawing lower leaves stage 2 hundreds of nodes whose unique boolean
 * exhausts its two-value space and throws mid-plan.
 *
 * Contract under test (generateNetwork.ts feasibility header): preflight
 * "fails the same way on every seed" — an infeasible protocol must be refused
 * seed-independently, and a protocol preflight approves must plan on every
 * seed. So every seed must have the same outcome.
 */

const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        nickname: {
          name: 'Nickname',
          type: 'text',
        },
        flag: {
          name: 'Flag',
          type: 'boolean',
          validation: { unique: true },
        },
      },
    },
  },
} as unknown as Codebook;

const stages: Stage[] = [
  {
    id: 'stage-1',
    type: 'NameGenerator',
    label: 'First namer',
    subject: { entity: 'node', type: 'person' },
    // A real collection surface over a NON-flag variable, so this stage's
    // creation writes are narrowed to {nickname} rather than conservatively
    // widened to 'all' (declaresNodeCollection) — its nodes never carry flag.
    form: { title: 'Add', fields: [{ variable: 'nickname', prompt: 'NAME' }] },
    prompts: [{ id: 'p1', text: 'Name people' }],
    // Ceiling = max = 10000 (the whole budget); draw ~ N(9999, 500) clamped
    // to [0, 10000], so roughly half of seeds leave stage 2 more than two
    // people and half leave it fewer.
    synthetic: {
      count: { distribution: 'normal', mean: 9999, sd: 500, max: 10000 },
    },
  } as unknown as Stage,
  {
    id: 'stage-2',
    type: 'NameGenerator',
    label: 'Second namer',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add',
      fields: [{ variable: 'flag', prompt: 'FLAG' }],
    },
    prompts: [{ id: 'p2', text: 'Name more people' }],
    // Ceiling 10000: total ceiling demand 20000 > MAX_SYNTHETIC_POPULATION,
    // so the budget binds and preflight trims this stage's cap to 0.
    synthetic: { count: { distribution: 'constant', value: 10000 } },
  } as unknown as Stage,
];

describe('population budget: feasibility ceilings vs planner draws', () => {
  it('gives every seed the same outcome (refused at preflight, or planned)', () => {
    const outcomes = new Map<string, number[]>();
    for (let seed = 1; seed <= 8; seed++) {
      let outcome: string;
      try {
        generateNetwork({ seed, codebook, stages });
        outcome = 'planned';
      } catch (error) {
        outcome = `threw ${(error as Error).name}: ${(error as Error).message}`;
      }
      const seeds = outcomes.get(outcome) ?? [];
      seeds.push(seed);
      outcomes.set(outcome, seeds);
    }
    // Seed-independence: one outcome across all seeds.
    expect(
      [...outcomes.entries()].map(([outcome, seeds]) => ({ outcome, seeds })),
    ).toHaveLength(1);
  });
});
