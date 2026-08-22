import { env } from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  collectInterfaceImpliedRules,
  MAX_SYNTHETIC_PAIRS,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  NcNetworkSchema,
  type VariableValue,
} from '@codaco/shared-consts';

import { analyseFeasibility } from '../constraints/feasibility';
import {
  type CorpusProtocol,
  type CorpusShape,
  type CorpusVariable,
  generateCorpusProtocol,
} from '../corpus';
import { generateInterviews } from '../index';

/**
 * The acceptance corpus (criteria C3, C7, C12; spec rule 1).
 *
 * The pre-seed gate is the ONE predictive model of what a protocol can produce,
 * and rule 1 says a single predictive model is only safe if something holds it
 * to the generator. That something is here, in two halves that have to agree
 * without sharing a line of code:
 *
 *  - a BRUTE-FORCE oracle, which reads the shape record the corpus generated
 *    from and works out by enumeration what each variable's value space holds
 *    and how many entities will be given one. It imports nothing from the
 *    constraints tree — not `valueSpaceSize`, not `worstCaseEntityCounts` — so
 *    an error shared between the gate and the oracle would have to be made
 *    twice, in two different vocabularies;
 *  - the GENERATOR itself. Where the gate accepts, every seed must produce a
 *    session that round-trips the network schema, satisfies every rule its
 *    variables carry, and holds distinct values in every `unique` slot. Where
 *    it refuses, every seed must refuse identically.
 *
 * Scale is env-driven, exactly as the engine this replaces was:
 * `CORPUS_SHAPES`, `CORPUS_SEEDS`, `CORPUS_SHARD` ("i/n"), and `CORPUS_REPORT=1`
 * for a coverage line. The defaults are the committed ones and are sized to run
 * on every commit; the evidence configuration is a larger `CORPUS_SHAPES`.
 */

/**
 * A malformed scale variable must fail loudly: `Number('abc')` is NaN, and a
 * NaN bound would run zero shapes and report the empty corpus as a pass.
 */
const positiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received "${raw}"`);
  }
  return parsed;
};

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

const START_WINDOW = '2026-08-14T12:00:00.000Z';
const TODAY = START_WINDOW.slice(0, 10);

// ---------------------------------------------------------------------------
// The brute-force oracle
// ---------------------------------------------------------------------------

/**
 * Every value the generator can produce for one variable, enumerated.
 *
 * Built from the shape's own declaration rather than from the constraint
 * machinery's analysis of the codebook — that analysis is what is being
 * checked. `undefined` means "more values than any shape here can spend", which
 * is the honest answer for text: the sequence a `unique` text variable walks is
 * astronomically longer than a corpus network.
 */
const oracleDomain = (variable: CorpusVariable): number | undefined => {
  switch (variable.type) {
    case 'boolean':
      return 2;
    case 'ordinal':
      return variable.options?.length ?? 0;
    case 'number': {
      const low = variable.minValue ?? 0;
      const high = variable.maxValue ?? 0;
      // Whole values, which is what the draw walks over an integer range.
      return high - low + 1;
    }
    case 'text':
      return undefined;
  }
};

/**
 * How many people carry a drawn value for `variable`, counted by walking the
 * shape's stage list the way a reader would.
 *
 * Deliberately arithmetic on the shape record rather than a second pass over
 * the parsed protocol: the gate reads the protocol, so an oracle that read it
 * too could inherit the same misreading of a stage.
 */
const oracleNodeHolders = (shape: CorpusShape, id: string): number => {
  let people = 0;
  let holders = 0;

  for (const generator of shape.generators) {
    people += generator.count;
    if (generator.collects.includes(id)) holders += generator.count;
  }

  if (shape.roster) {
    // A roster row arrives carrying its own columns and is passed over when a
    // value it holds is taken, so it never forces a draw. It still adds a
    // person a later form can fill.
    people += Math.min(shape.roster.count, shape.roster.poolSize);
  }

  // The alter form runs last of the value-writing stages, over everybody.
  if (shape.alterForm.includes(id)) holders = Math.max(holders, people);

  return holders;
};

/** The people a census enumerates pairs of, at the moment it runs. */
const oracleCensusPopulation = (shape: CorpusShape): number => {
  const elicited = shape.generators.reduce(
    (total, generator) => total + generator.count,
    0,
  );
  const fromRoster = shape.roster
    ? Math.min(shape.roster.count, shape.roster.poolSize)
    : 0;
  return elicited + fromRoster;
};

const oraclePairs = (people: number): number => (people * (people - 1)) / 2;

/** Why the oracle says this shape can never generate, or an empty list. */
const oracleRefusals = (shape: CorpusShape): string[] => {
  const refusals: string[] = [];

  if (
    shape.roster?.minNodes !== undefined &&
    shape.roster.poolSize < shape.roster.minNodes
  ) {
    refusals.push('roster pool below min-nodes');
  }

  if (shape.census !== 'none') {
    // The guaranteed population, which for a corpus shape is the only
    // population: every count is a constant.
    const pairs = oraclePairs(oracleCensusPopulation(shape));
    if (pairs > MAX_SYNTHETIC_PAIRS) refusals.push('pair work above the cap');
  }

  for (const variable of shape.nodeVariables) {
    if (!variable.unique) continue;
    const domain = oracleDomain(variable);
    const holders = oracleNodeHolders(shape, variable.id);
    if (domain !== undefined && holders > domain) {
      refusals.push(`node ${variable.id} has ${domain} values for ${holders}`);
    }
  }

  if (
    shape.census === 'tieStrength' &&
    shape.tieStrengthVariable !== undefined
  ) {
    const graded = shape.edgeVariables.find(
      (variable) => variable.id === shape.tieStrengthVariable,
    );
    const domain = graded === undefined ? undefined : oracleDomain(graded);
    // Every pair the census asks about can end up carrying a graded edge, so
    // the pair set is what the slot has to cover.
    const holders = oraclePairs(oracleCensusPopulation(shape));
    if (graded?.unique === true && domain !== undefined && holders > domain) {
      refusals.push(`edge ${graded.id} has ${domain} values for ${holders}`);
    }
  }

  return refusals;
};

// ---------------------------------------------------------------------------
// The corpus, built once
// ---------------------------------------------------------------------------

type CorpusEntry = CorpusProtocol & {
  /** Whether the pre-seed gate accepts this shape. */
  accepted: boolean;
  /** Whether the brute-force oracle can find no reason to refuse it. */
  satisfiable: boolean;
  refusals: string[];
};

let cached: CorpusEntry[] | undefined;

const corpus = (): CorpusEntry[] => {
  if (cached) return cached;

  const entries: CorpusEntry[] = [];
  for (let index = 0; index < SHAPES; index += 1) {
    if (index % shardCount !== shardIndex) continue;

    const built = generateCorpusProtocol(index);
    const conflicts = analyseFeasibility({
      protocol: built.protocol,
      assetData: built.assetData,
      today: TODAY,
      interfaceRules: collectInterfaceImpliedRules(built.protocol),
    });
    const refusals = oracleRefusals(built.shape);

    entries.push({
      ...built,
      accepted: conflicts.length === 0,
      satisfiable: refusals.length === 0,
      refusals,
    });
  }

  cached = entries;
  return entries;
};

/** Every rule a corpus variable is held to, applied to one drawn value. */
const violates = (variable: CorpusVariable, value: VariableValue): boolean => {
  switch (variable.type) {
    case 'boolean':
      return typeof value !== 'boolean';
    case 'ordinal':
      return (
        typeof value !== 'number' || !(variable.options ?? []).includes(value)
      );
    case 'number':
      return (
        typeof value !== 'number' ||
        value < (variable.minValue ?? 0) ||
        value > (variable.maxValue ?? 0)
      );
    case 'text':
      return typeof value !== 'string';
  }
};

const attributeKey = (value: VariableValue): string => JSON.stringify(value);

describe(`synthetic interview corpus (${SHAPES} shapes, shard ${SHARD})`, () => {
  it('builds a corpus with both verdicts in it', () => {
    const entries = corpus();

    expect(entries.length).toBeGreaterThan(0);
    // A corpus that never refuses proves nothing about the refusals, and one
    // that always refuses proves nothing about generation.
    expect(entries.some((entry) => entry.accepted)).toBe(true);
    expect(entries.some((entry) => !entry.accepted)).toBe(true);

    if (REPORT) {
      const censuses = new Set(entries.map((entry) => entry.shape.census));
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          shard: SHARD,
          shapes: entries.length,
          accepted: entries.filter((entry) => entry.accepted).length,
          withRoster: entries.filter((entry) => entry.shape.roster).length,
          censuses: [...censuses],
          uniqueNodeVariables: entries.filter((entry) =>
            entry.shape.nodeVariables.some((variable) => variable.unique),
          ).length,
        }),
      );
    }
  });

  it('gives a verdict matching brute-force satisfiability exactly', () => {
    const mismatches = corpus()
      .filter((entry) => entry.accepted !== entry.satisfiable)
      .map((entry) => ({
        index: entry.shape.index,
        accepted: entry.accepted,
        oracleRefusals: entry.refusals,
        shape: entry.shape,
      }));

    expect(mismatches).toEqual([]);
  });

  it(
    `generates every accepted shape on ${SEEDS} consecutive seeds with valid values`,
    { timeout: 1_800_000 },
    () => {
      const failures: { index: number; seed: number; problem: string }[] = [];
      let runs = 0;

      for (const entry of corpus()) {
        if (!entry.accepted) continue;
        const { shape } = entry;

        for (let seed = 0; seed < SEEDS; seed += 1) {
          try {
            runs += 1;
            const [result] = generateInterviews(
              entry.protocol,
              {
                count: 1,
                seed,
                simulateDropOut: false,
                startWindow: START_WINDOW,
              },
              entry.assetData,
            );
            const network = result?.session.network;
            if (network === undefined) {
              failures.push({
                index: shape.index,
                seed,
                problem: 'no network',
              });
              continue;
            }

            // C2's round trip, asserted here too because a corpus network is a
            // shape nobody wrote and is where a coercion would first show.
            expect(NcNetworkSchema.parse(network)).toStrictEqual(network);

            // C7's cheap realisation check: a constant count is a promise, and
            // the roster half of it is bounded by the rows the run resolved.
            const expectedNodes =
              shape.generators.reduce(
                (total, generator) => total + generator.count,
                0,
              ) +
              (shape.roster
                ? Math.min(shape.roster.count, shape.roster.poolSize)
                : 0);
            if (network.nodes.length !== expectedNodes) {
              failures.push({
                index: shape.index,
                seed,
                problem: `built ${network.nodes.length} nodes, expected ${expectedNodes}`,
              });
            }

            // C3: every value present satisfies the rules its variable carries.
            for (const [variables, entities] of [
              [shape.nodeVariables, network.nodes],
              [shape.edgeVariables, network.edges],
            ] as const) {
              for (const variable of variables) {
                const held: string[] = [];
                for (const entity of entities) {
                  const value = entity[entityAttributesProperty][variable.id];
                  if (value === undefined || value === null) continue;
                  if (violates(variable, value)) {
                    failures.push({
                      index: shape.index,
                      seed,
                      problem: `${variable.id} holds ${JSON.stringify(value)}`,
                    });
                  }
                  held.push(attributeKey(value));
                }
                if (variable.unique && new Set(held).size !== held.length) {
                  failures.push({
                    index: shape.index,
                    seed,
                    problem: `${variable.id} repeats a unique value`,
                  });
                }
              }
            }
          } catch (error) {
            failures.push({
              index: shape.index,
              seed,
              problem: String(error).slice(0, 200),
            });
          }
        }
      }

      expect(runs).toBeGreaterThan(0);
      expect(failures).toEqual([]);

      if (REPORT) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify({ shard: SHARD, generateRuns: runs }));
      }
    },
  );
});
