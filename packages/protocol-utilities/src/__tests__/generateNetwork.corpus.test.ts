import { env } from 'node:process';

import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';
import {
  NcNetworkSchema,
  entityAttributesProperty,
  type VariableValue,
} from '@codaco/shared-consts';

import { generateNetwork } from '../generateNetwork';
import { resolveGenerationConfig } from '../generateNetwork/config';
import { analyseFeasibility } from '../generateNetwork/constraints/feasibility';
import { delegatedValidationContradictions } from '../generateNetwork/constraints/validationContradictions';

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
 * Every shape carries an edge type as well as a node type: a name generator of
 * a fixed size, a DyadCensus over its people, and sometimes a
 * TieStrengthCensus answering the same edge type again. The edge type's
 * variables come from the same rule grammar the node families use, plus at
 * most one `unique` variable — which is what puts the entity COUNT inside the
 * oracle's reach. Without a `unique` rule nothing measures a variable's value
 * space against how many entities the run builds, so a census pair count could
 * be narrowed unsoundly and every assertion here would still pass.
 *
 * Nothing here fixes a value: no prompt carries `additionalAttributes` and no
 * roster is supplied, so the interaction between a fixed value and a `unique`
 * slot is out of this corpus' reach by construction rather than by oversight.
 * An edge could not reach it in any case — `analyseFeasibility` gives every
 * edge scope no fixed values at all, because nothing writes onto an edge that
 * the draw did not choose.
 *
 * Scale is environment-driven so CI stays fast while the same file provides
 * the full evidence run: CORPUS_SHAPES (total shapes), CORPUS_SEEDS (seeds
 * per accepted shape), CORPUS_SHARD ("i/n" to split a large run across
 * processes), CORPUS_REPORT=1 to print the distribution summary.
 */
const TODAY = '2026-07-27';

/**
 * A per-pair probability every pair clears, so the worst-case pair count the
 * analysis reasons about is also the count the run really builds — which is
 * what lets the generation half assert an exact edge count rather than a
 * bound. `createEdgesForPairs` draws `randomFloat(0, 1)`, whose faker stream
 * is half-open at the top, so `< 1` holds for every pair.
 */
const ALWAYS_PAIRED = { min: 1, max: 1 };

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

const config = resolveGenerationConfig({
  today: TODAY,
  censusEdgeProbability: ALWAYS_PAIRED,
});

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
  /** Declared `unique: true`. Only ever set on an isolated edge variable. */
  unique?: true;
};

type CorpusShape = {
  index: number;
  family: 'chain' | 'pinned' | 'sameAs' | 'scalarPair' | 'mixed';
  variables: CorpusVariable[];
  /** The name generator's fixed node count, which decides the pair count. */
  nodeCount: number;
  /** How many prompts of the census name the edge type, each reusing the last's edges. */
  censusPrompts: number;
  edgeVariables: CorpusVariable[];
  /** The edge variable declared `unique`, where the shape has one. */
  uniqueEdgeId?: string;
  /**
   * The edge variable a following TieStrengthCensus rewrites over the edges the
   * DyadCensus left, where the shape has one.
   */
  tieStrengthEdgeId?: string;
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

/** One family's variables, before the shape's edge half is drawn around them. */
type NodeFamily = Pick<CorpusShape, 'family' | 'variables'>;

function chainShape(rand: Rand): NodeFamily {
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

  return { family: 'chain', variables };
}

function pinnedShape(rand: Rand): NodeFamily {
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

  return { family: 'pinned', variables };
}

function sameAsShape(rand: Rand): NodeFamily {
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

  return { family: 'sameAs', variables };
}

/**
 * Two scalars ordered against each other, sometimes with a third variable
 * excluded from one of them. Kept as its own small family because a scalar's
 * 101-value grid multiplies fast: two grids and one more small variable is
 * the widest shape that stays inside the tractability limits.
 */
function scalarPairShape(rand: Rand): NodeFamily {
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

  return { family: 'scalarPair', variables };
}

/**
 * A run of variables of mixed types, none of them yet carrying a rule. Shared
 * by the node `mixed` family and the edge type, so the edge half is drawn from
 * the same grammar rather than from a second, quietly diverging one.
 */
function mixedVariables(
  prefix: string,
  count: number,
  rand: Rand,
): CorpusVariable[] {
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
    variables.push(variableOf(`${prefix}${i}`, type, rand));
  }
  return variables;
}

/** Wires each variable to one or two rules against the ones declared before it. */
function wireMixedRules(variables: CorpusVariable[], rand: Rand): void {
  const count = variables.length;
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
}

function mixedShape(rand: Rand): NodeFamily {
  const variables = mixedVariables('v', rand.int(2, 4), rand);
  wireMixedRules(variables, rand);
  return { family: 'mixed', variables };
}

/**
 * The variables of the shape's edge type: the same mixed grammar the node
 * `mixed` family uses, and at most one `unique` variable declared after it.
 *
 * The `unique` variable is deliberately isolated — it carries no rule of its
 * own, and nothing references it, because it is appended after the rules are
 * wired and every rule points backwards. So the values a run can reach for it
 * are exactly its own domain, whatever the rest of the type says, and
 * {@link oracleUniqueRoom} can count them without a search. That keeps this
 * half of the oracle a statement about how many EDGES the run builds, which is
 * the thing nothing else here measures; how narrow propagation leaves a value
 * space is what the node families already cover.
 *
 * Scalars are left out of the `unique` draw: the schema does not permit
 * `unique` on the type, and its 101-point grid is wider than any pair count
 * this corpus reaches, so it could never separate a sound count from an
 * unsound one.
 */
function edgeVariablesFor(
  rand: Rand,
): Pick<CorpusShape, 'edgeVariables' | 'uniqueEdgeId' | 'tieStrengthEdgeId'> {
  const edgeVariables = mixedVariables('e', rand.int(1, 3), rand);
  wireMixedRules(edgeVariables, rand);

  let uniqueEdgeId: string | undefined;
  if (rand.next() < 0.6) {
    const unique = variableOf(
      'u',
      rand.pick(['boolean', 'ordinal', 'number', 'datetime'] as const),
      rand,
    );
    unique.unique = true;
    edgeVariables.push(unique);
    uniqueEdgeId = unique.id;
  }

  // A TieStrengthCensus rewrites one variable over the edges the DyadCensus
  // left, which is a partial regeneration around values the edge already holds.
  // Never the `unique` one: allocating a shared slot across a redraw of every
  // edge at once is its own question, and pinning it here would make this
  // family's verdict depend on it.
  const rewritable = edgeVariables.filter((variable) => !variable.unique);
  const tieStrengthEdgeId =
    rewritable.length > 0 && rand.next() < 0.5
      ? rand.pick(rewritable).id
      : undefined;

  return {
    edgeVariables,
    ...(uniqueEdgeId !== undefined ? { uniqueEdgeId } : {}),
    ...(tieStrengthEdgeId !== undefined ? { tieStrengthEdgeId } : {}),
  };
}

function generateShape(index: number): CorpusShape {
  const rand = randFor((index + 1) * 0x9e3779b1);
  const family = rand.next();
  // Drawn before the edge half, so a change to the edge grammar leaves every
  // node family's shapes exactly as they were.
  const nodes =
    family < 0.25
      ? chainShape(rand)
      : family < 0.45
        ? pinnedShape(rand)
        : family < 0.6
          ? sameAsShape(rand)
          : family < 0.7
            ? scalarPairShape(rand)
            : mixedShape(rand);

  // Two, three or four people, so the census reaches one, three or six pairs.
  // Weighted towards the small end: the pair count is what a `unique` edge
  // variable is measured against, and six pairs is already past the widest
  // domain the draw below offers.
  const nodeCount = rand.next() < 0.4 ? 2 : rand.next() < 0.7 ? 3 : 4;

  return {
    index,
    ...nodes,
    nodeCount,
    // A second prompt naming the same edge type reuses every edge the first
    // one left, so it must add nothing to the count.
    censusPrompts: rand.next() < 0.5 ? 2 : 1,
    ...edgeVariablesFor(rand),
  };
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
  variables: readonly CorpusVariable[],
  valueOf: (id: string) => VariableValue,
): boolean {
  for (const variable of variables) {
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
function oracleSatisfiable(
  variables: readonly CorpusVariable[],
  label: string,
): boolean {
  const domains = variables.map(oracleDomain);
  if (domains.some((domain) => domain.length === 0)) return false;

  // The shape families are written to keep this space small (the widest is
  // two scalar grids beside one number, ~62k combinations). A future family
  // that widens past this cap should fail loudly here, not stretch the run
  // towards its timeout.
  const product = domains.reduce((total, domain) => total * domain.length, 1);
  if (product > 1_000_000) {
    throw new Error(
      `${label} spans ${product} combinations; keep corpus families below the solver's tractability limits`,
    );
  }

  const indices = domains.map(() => 0);
  const assignment = new Map<string, VariableValue>();
  const valueOf = (id: string): VariableValue => {
    const value = assignment.get(id);
    if (value === undefined) {
      throw new Error(`Oracle read unassigned variable ${id}`);
    }
    return value;
  };

  for (;;) {
    variables.forEach((variable, at) => {
      assignment.set(variable.id, domains[at]![indices[at]!]!);
    });
    if (satisfiesRules(variables, valueOf)) return true;

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

/**
 * The unordered pairs a census walks over `count` people, which is the number
 * of edges of one type the whole run can hold.
 *
 * Every part of that sentence is a committed behaviour rather than a reading of
 * the analysis:
 *
 * - The population is the name generator's own ceiling, and a stage declaring
 *   `maxNodes` is held to it — entityCounts.test.ts, "uses the stage maxNodes
 *   when declared".
 * - A census bounds its edge type by the pairs over that population —
 *   entityCounts.test.ts, "bounds an edge type by the pair count over its node
 *   type" (four people, C(4, 2) = 6).
 * - One edge per unordered pair, however many prompts and stages ask about it,
 *   because `createEdgesForPairs` looks the pair up before drawing —
 *   entityCounts.test.ts, "counts one census pair set however many prompts and
 *   stages ask for it", and edgeReuse.test.ts, "leaves one edge per pair when
 *   two census stages share an edge type". A TieStrengthCensus meeting an edge
 *   it did not create writes onto it rather than adding one — edgeReuse.test.ts,
 *   "writes its edge variable onto the reused edge instead of drawing another".
 *
 * The corpus pins `censusEdgeProbability` to 1, so this bound is also the exact
 * count: nothing here has to reason about the pairs a lower probability leaves
 * unjoined.
 */
function pairCount(nodeCount: number): number {
  return (nodeCount * (nodeCount - 1)) / 2;
}

/**
 * Whether the edge type's `unique` variable has a value for every edge the run
 * builds.
 *
 * A `unique` rule is the only thing that makes an entity COUNT part of
 * satisfiability, and it makes it part of it by pigeonhole alone: every edge a
 * census creates is born holding a value for every variable its type declares
 * (entityCounts.test.ts, "counts an unnamed variable on edges another stage
 * creates"), so N edges hold N values of the variable, and no two of them may
 * be equal. Fewer than N reachable values therefore has no satisfying run —
 * a fact about the draw, not about how the analysis counts, which is what makes
 * disagreement here a report about the analysis rather than about this checker.
 *
 * That the generator really does refuse exactly this is pinned by
 * entityCounts.test.ts, "still refuses when the composer own people do exhaust
 * it" and "refuses it anyway, counting the pairs the filter is not read to
 * exclude" — a three-person DyadCensus against a `unique` boolean, refused for
 * "up to 3 edges of this type can be generated".
 *
 * The reachable values are the variable's own domain because
 * {@link edgeVariablesFor} declares it isolated; see the note there.
 */
function oracleUniqueRoom(shape: CorpusShape): boolean {
  const unique = shape.edgeVariables.find(
    (variable) => variable.id === shape.uniqueEdgeId,
  );
  if (unique === undefined) return true;
  return oracleDomain(unique).length >= pairCount(shape.nodeCount);
}

type Codebook = Parameters<typeof generateNetwork>[0]['codebook'];

function codebookVariables(
  declared: readonly CorpusVariable[],
): Record<string, unknown> {
  const variables: Record<string, unknown> = {};

  for (const variable of declared) {
    const validation: Record<string, unknown> = {};
    for (const rule of variable.rules) validation[rule.kind] = rule.target;
    if (variable.unique) validation.unique = true;

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

  return variables;
}

function codebookFor(shape: CorpusShape): Codebook {
  return {
    node: {
      person: {
        color: 'node-color-seq-1',
        variables: codebookVariables(shape.variables),
      },
    },
    edge: {
      link: {
        name: 'Link',
        color: 'edge-color-seq-1',
        variables: codebookVariables(shape.edgeVariables),
      },
    },
  } as unknown as Codebook;
}

/**
 * The shape's stages, in the order `generateNetwork` runs them: a name
 * generator of a fixed size, a DyadCensus pairing everyone it built, and
 * sometimes a TieStrengthCensus answering the same edge type over the very
 * edges the census left.
 *
 * Both censuses take the whole population — the pair set a stage reaches is the
 * people standing when it runs, so putting them after the name generator is
 * what makes `pairCount(nodeCount)` the right number.
 */
function stagesFor(shape: CorpusShape): Stage[] {
  const stages: Stage[] = [
    {
      id: 'stage-1',
      type: 'NameGenerator',
      label: 'Name generator',
      subject: { entity: 'node', type: 'person' },
      prompts: [{ id: 'p1', text: 'Name people' }],
      behaviours: { minNodes: shape.nodeCount, maxNodes: shape.nodeCount },
    } as unknown as Stage,
    {
      id: 'stage-2',
      type: 'DyadCensus',
      label: 'Census',
      subject: { entity: 'node', type: 'person' },
      prompts: Array.from({ length: shape.censusPrompts }, (_prompt, at) => ({
        id: `c${at + 1}`,
        text: 'Do they know each other?',
        createEdge: 'link',
      })),
    } as unknown as Stage,
  ];

  if (shape.tieStrengthEdgeId !== undefined) {
    stages.push({
      id: 'stage-3',
      type: 'TieStrengthCensus',
      label: 'How close?',
      subject: { entity: 'node', type: 'person' },
      prompts: [
        {
          id: 't1',
          text: 'How close are they?',
          createEdge: 'link',
          edgeVariable: shape.tieStrengthEdgeId,
          negativeLabel: 'Not at all',
        },
      ],
    } as unknown as Stage);
  }

  return stages;
}

type CorpusEntry = {
  shape: CorpusShape;
  feasible: boolean;
  satisfiable: boolean;
  conflictCount: number;
  delegatedRejection: boolean;
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
      stagesFor(shape),
      config,
    );
    const delegatedRejection = [
      codebookVariables(shape.variables),
      codebookVariables(shape.edgeVariables),
    ].some(
      (variables) =>
        delegatedValidationContradictions(variables, new Set()).length > 0,
    );
    entries.push({
      shape,
      feasible: conflicts.length === 0,
      // Two scopes and one count. Node and edge rules are per-entity and
      // independent of each other, so each is satisfiable on its own terms;
      // what spans entities is the `unique` slot, which is the only place the
      // pair count can be read off.
      satisfiable:
        oracleSatisfiable(
          shape.variables,
          `Shape ${index} (${shape.family})`,
        ) &&
        oracleSatisfiable(
          shape.edgeVariables,
          `Shape ${index} (${shape.family}) edges`,
        ) &&
        oracleUniqueRoom(shape),
      conflictCount: conflicts.length,
      delegatedRejection,
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
    const edgeTypeCounts = new Map<string, number>();
    const pairCounts = new Map<number, number>();
    for (const entry of entries) {
      for (const variable of entry.shape.variables) {
        typeCounts.set(variable.type, (typeCounts.get(variable.type) ?? 0) + 1);
      }
      for (const variable of entry.shape.edgeVariables) {
        edgeTypeCounts.set(
          variable.type,
          (edgeTypeCounts.get(variable.type) ?? 0) + 1,
        );
      }
      const pairs = pairCount(entry.shape.nodeCount);
      pairCounts.set(pairs, (pairCounts.get(pairs) ?? 0) + 1);
    }
    const withUnique = entries.filter(
      (entry) => entry.shape.uniqueEdgeId !== undefined,
    );
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        shard: SHARD,
        shapes: entries.length,
        accepted: entries.filter((entry) => entry.feasible).length,
        families: Object.fromEntries(byFamily),
        variableTypes: Object.fromEntries(typeCounts),
        edgeVariableTypes: Object.fromEntries(edgeTypeCounts),
        pairsPerShape: Object.fromEntries(pairCounts),
        uniqueEdgeShapes: withUnique.length,
        uniqueEdgeRefused: withUnique.filter(
          (entry) => !oracleUniqueRoom(entry.shape),
        ).length,
        tieStrengthShapes: entries.filter(
          (entry) => entry.shape.tieStrengthEdgeId !== undefined,
        ).length,
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
          nodeCount: entry.shape.nodeCount,
          pairs: pairCount(entry.shape.nodeCount),
          variables: entry.shape.variables,
          edgeVariables: entry.shape.edgeVariables,
        }));

      expect(mismatches).toEqual([]);
    },
  );

  it('refuses every seeded record the delegated analyser rejects', () => {
    expect(
      corpus()
        .filter((entry) => entry.delegatedRejection && entry.feasible)
        .map((entry) => ({
          index: entry.shape.index,
          family: entry.shape.family,
          variables: entry.shape.variables,
          edgeVariables: entry.shape.edgeVariables,
        })),
    ).toEqual([]);
  });

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
        const { shape } = entry;
        const codebook = codebookFor(shape);
        const stages = stagesFor(shape);
        const expectedEdges = pairCount(shape.nodeCount);

        /** Every entity of one scope, checked against that scope's rules. */
        const checkEntities = (
          entities: {
            [entityAttributesProperty]: Record<string, VariableValue>;
          }[],
          declared: readonly CorpusVariable[],
          seed: number,
          scope: string,
        ): void => {
          for (const held of entities) {
            const attributes = held[entityAttributesProperty];
            const missing = declared
              .filter((variable) => attributes[variable.id] === undefined)
              .map((variable) => variable.id);
            if (missing.length > 0) {
              failures.push({
                index: shape.index,
                seed,
                problem: `${scope} missing attributes: ${missing.join(', ')}`,
              });
              continue;
            }
            const valueOf = (id: string): VariableValue => attributes[id]!;
            if (!satisfiesRules(declared, valueOf)) {
              failures.push({
                index: shape.index,
                seed,
                problem: `${scope} violates rules: ${JSON.stringify(attributes)} for ${JSON.stringify(declared)}`,
              });
            }
          }
        };

        for (let seed = 0; seed < SEEDS; seed++) {
          try {
            const startedAt = performance.now();
            const { network } = generateNetwork({
              codebook,
              stages,
              seed,
              config: { today: TODAY, censusEdgeProbability: ALWAYS_PAIRED },
            });
            expect(NcNetworkSchema.parse(network)).toStrictEqual(network);
            const elapsed = performance.now() - startedAt;
            runs += 1;
            if (elapsed > slowestMs) {
              slowestMs = elapsed;
              slowestShape = shape.index;
            }
            if (network.nodes.length !== shape.nodeCount) {
              failures.push({
                index: shape.index,
                seed,
                problem: `generated ${network.nodes.length} nodes, expected ${shape.nodeCount}`,
              });
            }
            // The reuse assertion. Every pair is joined once, whatever the
            // number of prompts and census stages asking about it, so a lost
            // dedup shows up here as a doubled count rather than only as a
            // `unique` slot running dry.
            if (network.edges.length !== expectedEdges) {
              failures.push({
                index: shape.index,
                seed,
                problem: `generated ${network.edges.length} edges over ${shape.nodeCount} nodes, expected ${expectedEdges}`,
              });
            }
            checkEntities(network.nodes, shape.variables, seed, 'node');
            checkEntities(network.edges, shape.edgeVariables, seed, 'edge');

            if (shape.uniqueEdgeId !== undefined) {
              const uniqueId = shape.uniqueEdgeId;
              const held = network.edges.map((edge) =>
                JSON.stringify(
                  edge[entityAttributesProperty][uniqueId] ?? null,
                ),
              );
              if (new Set(held).size !== held.length) {
                failures.push({
                  index: shape.index,
                  seed,
                  problem: `unique edge variable ${uniqueId} repeats a value: ${held.join(', ')}`,
                });
              }
            }
          } catch (error) {
            failures.push({
              index: shape.index,
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
