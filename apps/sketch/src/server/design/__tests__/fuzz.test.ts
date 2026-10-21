import { describe, expect, it } from 'vitest';

// @vitest-environment node
//
// Mutation fuzzer: LLM-style mistakes applied to valid designs. analyse() and
// compile() must never throw, and every protocol compiled from a mutant that
// still matches StudyDesignSchema (the provider grammar guarantees that shape)
// must pass validateProtocol, with and without wording. The reference run
// covered 12,000 mutants; CI runs a small, fixed sample.
import {
  findVariableRoleConflicts,
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { coverageDesign, messyDesign } from '../__fixtures__/cases.ts';
import {
  friendshipDesign,
  friendshipWording,
} from '../__fixtures__/example.ts';
import { analyse } from '../analyse.ts';
import { compile } from '../compile.ts';
import { StudyDesignSchema } from '../schema.ts';

const SEEDS = [1, 2, 3, 4];
const MUTANTS_PER_SEED = 125;

const JUNK = [
  '',
  'name',
  'layout',
  'consent',
  'Person',
  'person_name',
  'knows',
  'closeness',
  'how_met',
  'drinks_with',
  'xyz',
  'Yes',
  'never',
  '3',
  '-1',
  "I don't know",
  'person',
  'friend_map',
  'audit_frequency',
  'favourite',
  'studies_together',
  'classmate',
  'place_type',
  'circles',
  'mentor',
  'mentors_know',
  'strength',
  'friends',
  'a b c',
  '0',
];
const ENUMS: Record<string, string[]> = {
  kind: [
    'text',
    'long_text',
    'number',
    'yes_no',
    'single_choice',
    'multi_choice',
    'ordered',
    'slider',
    'date',
    'month_year',
    'year',
  ],
  operator: [
    'is',
    'is_not',
    'greater_than',
    'less_than',
    'at_least',
    'at_most',
    'includes',
    'excludes',
    'contains',
    'does_not_contain',
    'answered',
    'not_answered',
    'any_exist',
    'none_exist',
  ],
  method: [
    'quick_add',
    'form',
    'roster',
    'every_pair',
    'one_at_a_time',
    'with_strength',
  ],
  task: ['position', 'connect', 'highlight'],
  mode: ['always_show', 'show_only_if', 'skip_if'],
  about: ['participant', 'nodes', 'relationships'],
  whenSkipped: ['next_stage', 'end_interview'],
  match: ['all', 'any'],
};

type Node = Record<string, unknown> | unknown[];
const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null;

const makeRandom = (seed: number) => {
  let state = seed;
  const rnd = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  return { rnd, pick };
};

const mutate = (root: Node, { rnd, pick }: ReturnType<typeof makeRandom>) => {
  const slots: { o: Node; k: string | number }[] = [];
  const walk = (o: unknown) => {
    if (!isNode(o)) return;
    for (const k of Object.keys(o)) {
      const key = Array.isArray(o) ? Number(k) : k;
      slots.push({ o, k: key });
      walk((o as Record<string | number, unknown>)[key]);
    }
  };
  walk(root);
  const { o, k } = pick(slots);
  const rec = o as Record<string | number, unknown>;
  const v = rec[k];
  if (typeof v === 'string') {
    const choices = typeof k === 'string' ? ENUMS[k] : undefined;
    rec[k] = choices ? pick(choices) : pick(JUNK);
  } else if (typeof v === 'number') rec[k] = pick([0, 1, 2, -3, 25, 7.5, 1000]);
  else if (typeof v === 'boolean') rec[k] = !v;
  else if (Array.isArray(v)) {
    if (v.length && rnd() < 0.5) v.splice(Math.floor(rnd() * v.length), 1);
    else if (v.length) v.push(structuredClone(pick(v)));
    else if (Array.isArray(o)) o.splice(Number(k), 1);
  } else if (Array.isArray(o) && rnd() < 0.5) {
    const j = Math.floor(rnd() * o.length);
    [o[Number(k)], o[j]] = [o[j], o[Number(k)]];
  }
};

describe('mutation fuzzer', () => {
  it.each(SEEDS)(
    'seed %i: no throws and no invalid protocols',
    async (seed) => {
      const random = makeRandom(seed);
      const failures: string[] = [];
      let compiled = 0;
      for (let i = 0; i < MUTANTS_PER_SEED; i++) {
        const mutant = structuredClone(
          random.pick([friendshipDesign, coverageDesign, messyDesign]),
        );
        const m = 1 + Math.floor(random.rnd() * 6);
        for (let j = 0; j < m; j++) mutate(mutant, random);
        const parsed = StudyDesignSchema.safeParse(mutant);
        if (!parsed.success) continue;
        try {
          const { design, issues, fatal } = analyse(parsed.data);
          if (fatal) continue;
          for (const wording of [undefined, friendshipWording]) {
            const { protocol } = compile(design, wording, {
              mapboxToken: 'pk.test',
              worldGeojson: '{"type":"FeatureCollection","features":[]}',
              issues,
            });
            compiled++;
            const result = await validateProtocol(
              protocol as VersionedProtocol,
            );
            if (!result.success)
              failures.push(
                `mutant ${i}: ${JSON.stringify(result.error.issues.slice(0, 3))}`,
              );
            // no attribute is both asked in a form and written without one
            const conflicts = findVariableRoleConflicts(protocol);
            if (conflicts.length)
              failures.push(
                `mutant ${i}: ${conflicts.map((c) => c.variableName).join(', ')} written with and without validation`,
              );
          }
        } catch (e) {
          failures.push(`mutant ${i} threw: ${String(e)}`);
        }
      }
      expect(failures).toEqual([]);
      // the sample must actually exercise the compiler
      expect(compiled).toBeGreaterThan(MUTANTS_PER_SEED / 2);
    },
  );
});
