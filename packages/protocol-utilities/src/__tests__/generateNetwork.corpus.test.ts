import { env } from 'node:process';

import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { resolveGenerationConfig } from '../generateNetwork/config';
import { analyseFeasibility } from '../generateNetwork/constraints/feasibility';

/**
 * Randomised acceptance corpus for the finite-domain solver.
 *
 * Every shape is built so its constraint components fall below the solver's
 * tractability limits, which is the regime where two properties must hold
 * exactly:
 *
 * 1. `analyseFeasibility`'s verdict equals brute-force satisfiability — the
 *    oracle here enumerates the full cartesian space with its own local
 *    domain construction and rule semantics, sharing no code with the solver.
 * 2. Every accepted shape generates on every seed, with every emitted value
 *    satisfying every rule.
 *
 * Scale is environment-driven so CI stays fast while the same file provides
 * the full evidence run: CORPUS_SHAPES (total shapes), CORPUS_SEEDS (seeds
 * per accepted shape), CORPUS_SHARD ("i/n" to split a large run across
 * processes), CORPUS_REPORT=1 to print the distribution summary.
 */
const TODAY = '2026-07-27';

/**
 * A malformed scale variable must fail loudly: `Number('abc')` is NaN, and a
 * NaN bound would run zero shapes and report the empty corpus as a pass.
 */
function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${raw}"`);
  }
  return parsed;
}

const SHAPES = positiveInt(env.CORPUS_SHAPES, 600);
const SEEDS = positiveInt(env.CORPUS_SEEDS, 8);
const SHARD = env.CORPUS_SHARD ?? '0/1';
const REPORT = env.CORPUS_REPORT === '1';

const [shardIndex = 0, shardCount = 1] = SHARD.split('/').map(Number);
if (
  !Number.isInteger(shardIndex) ||
  !Number.isInteger(shardCount) ||
  shardCount <= 0 ||
  shardIndex < 0 ||
  shardIndex >= shardCount
) {
  throw new Error(`Invalid CORPUS_SHARD "${SHARD}", expected "i/n"`);
}

const config = resolveGenerationConfig({ today: TODAY });

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RuleKind =
  | 'greaterThanVariable'
  | 'lessThanVariable'
  | 'greaterThanOrEqualToVariable'
  | 'lessThanOrEqualToVariable'
  | 'differentFrom'
  | 'sameAs';

type CorpusRule = { kind: RuleKind; target: string };

type CorpusVariable = {
  id: string;
  type: 'number' | 'scalar' | 'datetime' | 'ordinal' | 'boolean';
  minValue?: number;
  maxValue?: number;
  dateMin?: string;
  dateMax?: string;
  options?: number[];
  rules: CorpusRule[];
};

type CorpusShape = {
  index: number;
  family: 'chain' | 'pinned' | 'sameAs' | 'scalarPair' | 'mixed';
  variables: CorpusVariable[];
};

const COMPARATORS: RuleKind[] = [
  'greaterThanVariable',
  'lessThanVariable',
  'greaterThanOrEqualToVariable',
  'lessThanOrEqualToVariable',
];

// Test-local date arithmetic, deliberately not shared with dateWindow.ts.
const MS_PER_DAY = 86_400_000;
function dayNumber(ymd: string): number {
  const [year = 0, month = 1, day = 1] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}
function ymdOf(day: number): string {
  const date = new Date(day * MS_PER_DAY);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

type Rand = {
  next: () => number;
  int: (lo: number, hi: number) => number;
  pick: <T>(items: readonly T[]) => T;
};

function randFor(seed: number): Rand {
  const next = mulberry32(seed);
  const int = (lo: number, hi: number): number =>
    lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(next() * items.length)]!;
  return { next, int, pick };
}

function numberVariable(id: string, rand: Rand): CorpusVariable {
  const minValue = rand.int(0, 5);
  return {
    id,
    type: 'number',
    minValue,
    maxValue: minValue + rand.int(0, 5),
    rules: [],
  };
}

function datetimeVariable(id: string, rand: Rand): CorpusVariable {
  const start = dayNumber('2024-03-01') + rand.int(0, 12);
  return {
    id,
    type: 'datetime',
    dateMin: ymdOf(start),
    dateMax: ymdOf(start + rand.int(0, 6)),
    rules: [],
  };
}

function ordinalVariable(id: string, rand: Rand): CorpusVariable {
  const count = rand.int(1, 5);
  return {
    id,
    type: 'ordinal',
    options: Array.from({ length: count }, (_value, at) => at + 1),
    rules: [],
  };
}

function variableOf(
  id: string,
  type: CorpusVariable['type'],
  rand: Rand,
): CorpusVariable {
  if (type === 'number') return numberVariable(id, rand);
  if (type === 'datetime') return datetimeVariable(id, rand);
  if (type === 'ordinal') return ordinalVariable(id, rand);
  return { id, type, rules: [] };
}

function chainShape(index: number, rand: Rand): CorpusShape {
  const edgeCount = rand.int(3, 5);
  const kind = rand.pick(['number', 'datetime'] as const);
  const variables: CorpusVariable[] = [];

  for (let i = 0; i <= edgeCount; i++) {
    const id = `v${i}`;
    if (kind === 'datetime') {
      variables.push(datetimeVariable(id, rand));
    } else {
      variables.push(numberVariable(id, rand));
    }
  }

  for (let i = 1; i <= edgeCount; i++) {
    const strict = rand.next() < 0.5;
    const declaresUpper = rand.next() < 0.5;
    variables[i]!.rules.push({
      kind: declaresUpper
        ? strict
          ? 'greaterThanVariable'
          : 'greaterThanOrEqualToVariable'
        : strict
          ? 'lessThanVariable'
          : 'lessThanOrEqualToVariable',
      target: `v${i - 1}`,
    });
  }

  return { index, family: 'chain', variables };
}

function pinnedShape(index: number, rand: Rand): CorpusShape {
  const count = rand.int(2, 3);
  const variables: CorpusVariable[] = [];
  for (let i = 0; i < count; i++) {
    const minValue = rand.int(2, 5);
    variables.push({
      id: `v${i}`,
      type: 'number',
      minValue,
      maxValue: minValue + rand.int(0, 2),
      rules: [],
    });
  }

  variables[0]!.rules.push({ kind: 'differentFrom', target: 'v1' });
  for (let i = 1; i < count; i++) {
    variables[i]!.rules.push({
      kind: rand.pick(COMPARATORS),
      target: rand.pick(variables.filter((variable) => variable.id !== `v${i}`))
        .id,
    });
  }

  return { index, family: 'pinned', variables };
}

function sameAsShape(index: number, rand: Rand): CorpusShape {
  const type = rand.pick(['number', 'ordinal', 'boolean', 'datetime'] as const);
  const first = variableOf('v0', type, rand);
  const second = variableOf('v1', type, rand);
  if (type === 'ordinal') second.options = [...(first.options ?? [])];
  second.rules.push({ kind: 'sameAs', target: 'v0' });

  const variables = [first, second];
  if (rand.next() < 0.7) {
    const third = variableOf(
      'v2',
      type === 'boolean' || type === 'ordinal' ? type : 'number',
      rand,
    );
    const comparable = third.type === 'number' && type === 'number';
    third.rules.push(
      comparable && rand.next() < 0.5
        ? { kind: rand.pick(COMPARATORS), target: rand.pick(['v0', 'v1']) }
        : { kind: 'differentFrom', target: rand.pick(['v0', 'v1']) },
    );
    variables.push(third);
  }

  return { index, family: 'sameAs', variables };
}

/**
 * Two scalars ordered against each other, sometimes with a third variable
 * excluded from one of them. Kept as its own small family because a scalar's
 * 101-value grid multiplies fast: two grids and one more small variable is
 * the widest shape that stays inside the tractability limits.
 */
function scalarPairShape(index: number, rand: Rand): CorpusShape {
  const first: CorpusVariable = { id: 'v0', type: 'scalar', rules: [] };
  const second: CorpusVariable = {
    id: 'v1',
    type: 'scalar',
    rules: [{ kind: rand.pick(COMPARATORS), target: 'v0' }],
  };

  const variables = [first, second];
  if (rand.next() < 0.5) {
    const third = numberVariable('v2', rand);
    third.rules.push({
      kind: 'differentFrom',
      target: rand.pick(['v0', 'v1']),
    });
    variables.push(third);
  }

  return { index, family: 'scalarPair', variables };
}

function mixedShape(index: number, rand: Rand): CorpusShape {
  const count = rand.int(2, 4);
  let scalarUsed = false;
  const variables: CorpusVariable[] = [];
  for (let i = 0; i < count; i++) {
    const candidates: CorpusVariable['type'][] = [
      'number',
      'number',
      'datetime',
      'ordinal',
      'boolean',
      ...(scalarUsed ? [] : (['scalar'] as const)),
    ];
    const type = rand.pick(candidates);
    if (type === 'scalar') scalarUsed = true;
    variables.push(variableOf(`v${i}`, type, rand));
  }

  for (let i = 1; i < count; i++) {
    const variable = variables[i]!;
    const ruleCount = rand.next() < 0.85 ? rand.int(1, 2) : 0;
    for (let r = 0; r < ruleCount; r++) {
      const target = variables[rand.int(0, i - 1)]!;
      // Comparators stay within one type. A number ordered against a scalar
      // can leave the number a fractional range, where the generator falls
      // back to two-decimal floats an integer-domain oracle cannot model;
      // that residual family has its own pinned regression test instead.
      const comparable =
        variable.type === target.type &&
        (variable.type === 'number' ||
          variable.type === 'scalar' ||
          variable.type === 'datetime');
      const kinds: RuleKind[] = [];
      if (comparable) kinds.push(...COMPARATORS);
      if (variable.type !== 'scalar') kinds.push('differentFrom');
      if (variable.type !== 'scalar' && variable.type === target.type) {
        kinds.push('sameAs');
      }
      if (kinds.length === 0) continue;

      const kind = rand.pick(kinds);
      if (variable.rules.some((rule) => rule.kind === kind)) continue;
      if (kind === 'sameAs' && variable.type === 'ordinal') {
        variable.options = [...(target.options ?? [])];
      }
      variable.rules.push({ kind, target: target.id });
    }
  }

  return { index, family: 'mixed', variables };
}

function generateShape(index: number): CorpusShape {
  const rand = randFor((index + 1) * 0x9e3779b1);
  const family = rand.next();
  if (family < 0.25) return chainShape(index, rand);
  if (family < 0.45) return pinnedShape(index, rand);
  if (family < 0.6) return sameAsShape(index, rand);
  if (family < 0.7) return scalarPairShape(index, rand);
  return mixedShape(index, rand);
}

/** The generator-reachable values for one variable, oracle-side. */
function oracleDomain(variable: CorpusVariable): VariableValue[] {
  switch (variable.type) {
    case 'number': {
      const values: number[] = [];
      for (let v = variable.minValue ?? 0; v <= (variable.maxValue ?? 0); v++) {
        values.push(v);
      }
      return values;
    }
    case 'scalar':
      return Array.from({ length: 101 }, (_value, at) =>
        Number((at / 100).toFixed(2)),
      );
    case 'datetime': {
      const from = dayNumber(variable.dateMin ?? TODAY);
      const to = dayNumber(variable.dateMax ?? TODAY);
      const values: string[] = [];
      for (let day = from; day <= to; day++) values.push(ymdOf(day));
      return values;
    }
    case 'ordinal':
      return [...(variable.options ?? [])];
    case 'boolean':
      return [false, true];
  }
}

function oracleKey(value: VariableValue): string {
  return JSON.stringify(value ?? null);
}

/**
 * Whether one assignment satisfies every rule the shape declares. Shared by
 * the oracle's enumeration and the check on generated output, because both
 * need the same ground-truth rule semantics; the *search* is what stays
 * independent of the solver.
 */
function satisfiesRules(
  shape: CorpusShape,
  valueOf: (id: string) => VariableValue,
): boolean {
  for (const variable of shape.variables) {
    const own = valueOf(variable.id);
    for (const rule of variable.rules) {
      const other = valueOf(rule.target);
      if (rule.kind === 'sameAs') {
        if (oracleKey(own) !== oracleKey(other)) return false;
        continue;
      }
      if (rule.kind === 'differentFrom') {
        if (oracleKey(own) === oracleKey(other)) return false;
        continue;
      }
      const ownComparable =
        variable.type === 'datetime' ? String(own) : Number(own);
      const otherComparable =
        variable.type === 'datetime' ? String(other) : Number(other);
      switch (rule.kind) {
        case 'greaterThanVariable':
          if (!(ownComparable > otherComparable)) return false;
          break;
        case 'lessThanVariable':
          if (!(ownComparable < otherComparable)) return false;
          break;
        case 'greaterThanOrEqualToVariable':
          if (!(ownComparable >= otherComparable)) return false;
          break;
        case 'lessThanOrEqualToVariable':
          if (!(ownComparable <= otherComparable)) return false;
          break;
      }
    }
  }
  return true;
}

/** Exhaustive cartesian search for any satisfying assignment. */
function oracleSatisfiable(shape: CorpusShape): boolean {
  const domains = shape.variables.map(oracleDomain);
  if (domains.some((domain) => domain.length === 0)) return false;

  // The shape families are written to keep this space small (the widest is
  // two scalar grids beside one number, ~62k combinations). A future family
  // that widens past this cap should fail loudly here, not stretch the run
  // towards its timeout.
  const product = domains.reduce((total, domain) => total * domain.length, 1);
  if (product > 1_000_000) {
    throw new Error(
      `Shape ${shape.index} (${shape.family}) spans ${product} combinations; keep corpus families below the solver's tractability limits`,
    );
  }

  const indices = domains.map(() => 0);
  const assignment = new Map<string, VariableValue>();
  const valueOf = (id: string): VariableValue => assignment.get(id) ?? null;

  for (;;) {
    shape.variables.forEach((variable, at) => {
      assignment.set(variable.id, domains[at]![indices[at]!]!);
    });
    if (satisfiesRules(shape, valueOf)) return true;

    let cursor = domains.length - 1;
    while (cursor >= 0) {
      indices[cursor]! += 1;
      if (indices[cursor]! < domains[cursor]!.length) break;
      indices[cursor] = 0;
      cursor -= 1;
    }
    if (cursor < 0) return false;
  }
}

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

function codebookFor(shape: CorpusShape): Codebook {
  const variables: Record<string, unknown> = {};

  for (const variable of shape.variables) {
    const validation: Record<string, unknown> = {};
    for (const rule of variable.rules) validation[rule.kind] = rule.target;

    if (variable.type === 'number') {
      validation.minValue = variable.minValue;
      validation.maxValue = variable.maxValue;
      variables[variable.id] = {
        name: variable.id.toUpperCase(),
        type: 'number',
        validation,
      };
    } else if (variable.type === 'scalar') {
      variables[variable.id] = {
        name: variable.id.toUpperCase(),
        type: 'scalar',
        component: 'VisualAnalogScale',
        validation,
      };
    } else if (variable.type === 'datetime') {
      variables[variable.id] = {
        name: variable.id.toUpperCase(),
        type: 'datetime',
        component: 'DatePicker',
        parameters: {
          type: 'full',
          min: variable.dateMin,
          max: variable.dateMax,
        },
        validation,
      };
    } else if (variable.type === 'ordinal') {
      variables[variable.id] = {
        name: variable.id.toUpperCase(),
        type: 'ordinal',
        options: (variable.options ?? []).map((option) => ({
          label: `Option ${option}`,
          value: option,
        })),
        validation,
      };
    } else {
      variables[variable.id] = {
        name: variable.id.toUpperCase(),
        type: 'boolean',
        validation,
      };
    }
  }

  return {
    node: {
      person: { color: 'node-color-seq-1', variables },
    },
  } as unknown as Codebook;
}

const nameGeneratorStage = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name generator',
  subject: { entity: 'node', type: 'person' },
  prompts: [{ id: 'p1', text: 'Name people' }],
  behaviours: { minNodes: 2, maxNodes: 2 },
} as unknown as Stage;

type CorpusEntry = {
  shape: CorpusShape;
  feasible: boolean;
  satisfiable: boolean;
  conflictCount: number;
};

let cached: CorpusEntry[] | undefined;
function corpus(): CorpusEntry[] {
  if (cached) return cached;
  const entries: CorpusEntry[] = [];
  for (let index = 0; index < SHAPES; index++) {
    if (index % shardCount !== shardIndex) continue;
    const shape = generateShape(index);
    const conflicts = analyseFeasibility(
      codebookFor(shape),
      [nameGeneratorStage],
      config,
    );
    entries.push({
      shape,
      feasible: conflicts.length === 0,
      satisfiable: oracleSatisfiable(shape),
      conflictCount: conflicts.length,
    });
  }
  cached = entries;

  if (REPORT) {
    const byFamily = new Map<string, { total: number; accepted: number }>();
    for (const entry of entries) {
      const bucket = byFamily.get(entry.shape.family) ?? {
        total: 0,
        accepted: 0,
      };
      bucket.total += 1;
      if (entry.feasible) bucket.accepted += 1;
      byFamily.set(entry.shape.family, bucket);
    }
    const typeCounts = new Map<string, number>();
    for (const entry of entries) {
      for (const variable of entry.shape.variables) {
        typeCounts.set(variable.type, (typeCounts.get(variable.type) ?? 0) + 1);
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        shard: SHARD,
        shapes: entries.length,
        accepted: entries.filter((entry) => entry.feasible).length,
        families: Object.fromEntries(byFamily),
        variableTypes: Object.fromEntries(typeCounts),
      }),
    );
  }

  return entries;
}

describe(`solver acceptance corpus (${SHAPES} shapes, shard ${SHARD})`, () => {
  it(
    'gives a feasibility verdict matching brute-force satisfiability exactly',
    { timeout: 1_800_000 },
    () => {
      const mismatches = corpus()
        .filter((entry) => entry.feasible !== entry.satisfiable)
        .map((entry) => ({
          index: entry.shape.index,
          family: entry.shape.family,
          feasible: entry.feasible,
          satisfiable: entry.satisfiable,
          variables: entry.shape.variables,
        }));

      expect(mismatches).toEqual([]);
    },
  );

  it(
    `generates every accepted shape on ${SEEDS} consecutive seeds with valid values`,
    { timeout: 3_600_000 },
    () => {
      const failures: {
        index: number;
        seed: number;
        problem: string;
      }[] = [];
      let slowestMs = 0;
      let slowestShape = -1;
      let runs = 0;

      for (const entry of corpus()) {
        if (!entry.feasible) continue;
        const codebook = codebookFor(entry.shape);

        for (let seed = 0; seed < SEEDS; seed++) {
          try {
            const startedAt = performance.now();
            const { network } = generateNetwork({
              codebook,
              stages: [nameGeneratorStage],
              seed,
              config: { today: TODAY },
            });
            const elapsed = performance.now() - startedAt;
            runs += 1;
            if (elapsed > slowestMs) {
              slowestMs = elapsed;
              slowestShape = entry.shape.index;
            }
            if (network.nodes.length === 0) {
              failures.push({
                index: entry.shape.index,
                seed,
                problem: 'generated no nodes',
              });
            }
            for (const node of network.nodes) {
              const attributes = node[entityAttributesProperty];
              const missing = entry.shape.variables
                .filter((variable) => attributes[variable.id] === undefined)
                .map((variable) => variable.id);
              if (missing.length > 0) {
                failures.push({
                  index: entry.shape.index,
                  seed,
                  problem: `missing attributes: ${missing.join(', ')}`,
                });
                continue;
              }
              const valueOf = (id: string): VariableValue => attributes[id]!;
              if (!satisfiesRules(entry.shape, valueOf)) {
                failures.push({
                  index: entry.shape.index,
                  seed,
                  problem: `violates rules: ${JSON.stringify(attributes)} for ${JSON.stringify(entry.shape.variables)}`,
                });
              }
            }
          } catch (error) {
            failures.push({
              index: entry.shape.index,
              seed,
              problem: `threw: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`,
            });
          }
        }
      }

      if (REPORT) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            shard: SHARD,
            generateRuns: runs,
            slowestRunMs: Number(slowestMs.toFixed(2)),
            slowestShape,
          }),
        );
      }

      expect(failures).toEqual([]);
    },
  );
});
