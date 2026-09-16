// Exactly what schema application puts on the wire, recorded from a real
// client and compared against an oracle written independently of the code that
// generates it.
//
// `installJobSchema` and `syncJobQueues` are the seam stage 3 moves onto
// `@effect/sql-pg`, which has no simple-query path: a multi-command string is
// refused there, so the statements have to be generated apart from the driver
// that sends them. This file is what makes that move provable — the statements
// are byte-identical before and after, in the same order, or these fail.
//
// A scratch database rather than a scratch schema, because pg-boss's
// construction plan names `JOB_SCHEMA` in its own text: the schema a caller
// passes decides what is probed, counted, dropped and granted, and the plan
// installs where it was rendered for. Isolation therefore has to be the
// database.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Predicate } from 'effect';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JOB_QUEUES, JOB_SCHEMA, jobGrantsSql } from '@codaco/studio-sync/jobs';

import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { installJobSchema, syncJobQueues } from '../install.ts';
import {
  JOB_SCHEMA_VERSION,
  QUEUE_OPTION_DEFAULTS,
  renderJobStatements,
} from '../queues.ts';

const db = await reachableDb();

/**
 * Where every scenario's recording is written, on every run, so that a change
 * to statement generation can be diffed rather than only asserted: run the
 * suite, copy this directory, make the change, run it again, `diff -r`. One
 * file per scenario, named for it.
 */
const RECORDING_DIR = join(tmpdir(), 'studio-job-install-recordings');

/** Creating a database and installing pg-boss's ~17KB plan into it. */
const CASE_TIMEOUT_MS = 120_000;

type RecordedStatement = {
  readonly phase: string;
  readonly text: string;
  readonly values: readonly unknown[];
};

function statementText(first: unknown): string {
  if (typeof first === 'string') return first;
  if (Predicate.hasProperty(first, 'text') && typeof first.text === 'string') {
    return first.text;
  }
  throw new Error(
    `a query was issued with no statement text: ${String(first)}`,
  );
}

function statementValues(first: unknown, second: unknown): readonly unknown[] {
  if (Array.isArray(second)) return second;
  if (Predicate.hasProperty(first, 'values') && Array.isArray(first.values)) {
    return first.values;
  }
  return [];
}

/**
 * The client under test, with every statement it is asked to run written down
 * before it is run. A `Proxy` rather than a stub because the statements have to
 * reach a real server: an oracle over text a fake accepted would prove the text
 * was generated, not that Postgres accepted it.
 *
 * `new Proxy<T>(target, …)` is typed `T`, so this is a `pg.PoolClient` and
 * needs no cast. Every member but `query` is read off the target, and a
 * function is bound to it — reached through the proxy, `this` would be the
 * proxy.
 */
function recordingClient(
  client: pg.PoolClient,
  phase: string,
  into: RecordedStatement[],
): pg.PoolClient {
  return new Proxy(client, {
    get(target, property) {
      if (property === 'query') {
        return (...args: unknown[]) => {
          into.push({
            phase,
            text: statementText(args[0]),
            values: statementValues(args[0], args[1]),
          });
          return Reflect.apply(target.query, target, args);
        };
      }
      const member: unknown = Reflect.get(target, property);
      return typeof member === 'function' ? member.bind(target) : member;
    },
  });
}

function dumpRecording(
  scenario: string,
  statements: readonly RecordedStatement[],
): void {
  mkdirSync(RECORDING_DIR, { recursive: true });
  writeFileSync(
    join(RECORDING_DIR, `${scenario}.json`),
    `${JSON.stringify(statements, undefined, 2)}\n`,
  );
}

function textsOf(
  statements: readonly RecordedStatement[],
  phase: string,
): string[] {
  return statements
    .filter((statement) => statement.phase === phase)
    .map((statement) => statement.text);
}

/**
 * The oracle for the construction plan, read from pg-boss's own output rather
 * than from the module under test: what `installJobSchema` sends is the plan
 * with the `BEGIN;`/`COMMIT;` it wraps itself in removed, and nothing else.
 */
function nestedConstructionPlan(): string {
  const plan = renderJobStatements()[0]!.trim();
  expect(plan.startsWith('BEGIN;')).toBe(true);
  expect(plan.endsWith('COMMIT;')).toBe(true);
  return plan.slice('BEGIN;'.length, -'COMMIT;'.length);
}

const CREATE_QUEUE = /\.create_queue\('([^']+)', '(.*)'::jsonb\)/;
const UPDATE_QUEUE = new RegExp(`UPDATE ${JOB_SCHEMA}\\.queue SET`);
/**
 * Whether a statement opens or ends a transaction. The command a statement
 * *starts* with, rather than any line of it: `BEGIN` also opens a plpgsql
 * block, and pg-boss's construction plan is full of those.
 */
const TRANSACTION_CONTROL = /^\s*(BEGIN|START TRANSACTION|COMMIT|ROLLBACK)\b/iu;

function transactionControlIn(
  statements: readonly RecordedStatement[],
  phase: string,
): string[] {
  return textsOf(statements, phase).filter((text) =>
    TRANSACTION_CONTROL.test(text),
  );
}

// The three scenarios are one story on one database, in order: the fresh
// install leaves the schema the re-apply finds, and the replacement edits that
// schema's version row. Run them together and in file order (no `.only`, no
// shuffle), or the later ones report failures that are not real.
describe.skipIf(!db)('the statements schema application sends', () => {
  let scratch: { pool: pg.Pool; dispose: () => Promise<void> };
  let client: pg.PoolClient;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchDatabase(db);
    client = await scratch.pool.connect();
  }, CASE_TIMEOUT_MS);

  afterAll(async () => {
    client.release();
    await scratch.dispose();
  }, CASE_TIMEOUT_MS);

  async function record(
    scenario: string,
    work: (forPhase: (phase: string) => pg.PoolClient) => Promise<void>,
  ): Promise<RecordedStatement[]> {
    const recorded: RecordedStatement[] = [];
    // The transaction is opened on the client itself rather than through a
    // recording proxy: part of what is asserted is that nothing the schema
    // application sends is a transaction control statement, so the test's own
    // must not be in the recording.
    await client.query('BEGIN');
    try {
      await work((phase) => recordingClient(client, phase, recorded));
    } finally {
      await client.query('COMMIT');
    }
    dumpRecording(scenario, recorded);
    return recorded;
  }

  it(
    'installs, then reconciles, on an empty database',
    async () => {
      const recorded = await record('fresh', async (forPhase) => {
        await installJobSchema(forPhase('install'), JOB_SCHEMA);
        await syncJobQueues(forPhase('sync'), JOB_SCHEMA);
      });

      expect(textsOf(recorded, 'install')).toEqual([
        `select to_regclass('${JOB_SCHEMA}.version') is not null as present`,
        nestedConstructionPlan(),
        jobGrantsSql(JOB_SCHEMA),
      ]);

      const created = textsOf(recorded, 'sync').flatMap((text) => {
        const match = CREATE_QUEUE.exec(text);
        return match ? [{ name: match[1], options: match[2] }] : [];
      });
      expect(created).toEqual(
        JOB_QUEUES.map(({ name, options }) => ({
          name,
          options: JSON.stringify({ ...options, policy: options.policy }),
        })),
      );
      expect(
        recorded.filter((statement) => UPDATE_QUEUE.test(statement.text)),
      ).toEqual([]);

      // Nothing the install path sends opens or ends a transaction: that is
      // what stripping pg-boss's wrapper buys, and `migrate` applies the whole
      // schema inside one transaction on the strength of it.
      expect(transactionControlIn(recorded, 'install')).toEqual([]);
      // pg-boss's own `createQueue`, on the other hand, wraps its call in
      // `BEGIN … COMMIT` (plans.locked), and a statement with nothing to bind
      // reaches Postgres through the simple protocol — so that COMMIT commits
      // whatever transaction the caller had open. Asserted rather than assumed
      // so a pg-boss release that changes it is noticed here: every one of
      // these, and nothing else in the phase, carries transaction control.
      expect(transactionControlIn(recorded, 'sync')).toEqual(
        textsOf(recorded, 'sync').filter((text) => CREATE_QUEUE.test(text)),
      );
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'reconciles in place when the installed version is this build’s',
    async () => {
      const recorded = await record('reapply', async (forPhase) => {
        await installJobSchema(forPhase('install'), JOB_SCHEMA);
        await syncJobQueues(forPhase('sync'), JOB_SCHEMA);
      });

      expect(textsOf(recorded, 'install')).toEqual([
        `select to_regclass('${JOB_SCHEMA}.version') is not null as present`,
        `select version from ${JOB_SCHEMA}.version`,
        jobGrantsSql(JOB_SCHEMA),
      ]);

      const updated = recorded
        .filter((statement) => UPDATE_QUEUE.test(statement.text))
        .map((statement) => statement.values);
      // Options first, then the name: pg-boss's update statement reads `$2`
      // before `$1`, and its placeholder rewriter renumbers the parameters
      // into the order they occur in the text.
      expect(updated).toEqual(
        JOB_QUEUES.map(({ name, options }) => {
          const { policy: _policy, ...declared } = options;
          return [{ ...QUEUE_OPTION_DEFAULTS, ...declared }, name];
        }),
      );
      expect(
        recorded.filter((statement) => CREATE_QUEUE.test(statement.text)),
      ).toEqual([]);

      // Nothing on this path opens or ends a transaction at all: `updateQueue`
      // binds its parameters, so pg-boss sends it unwrapped.
      expect(transactionControlIn(recorded, 'install')).toEqual([]);
      expect(transactionControlIn(recorded, 'sync')).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'replaces a schema installed at another version',
    async () => {
      await client.query(
        `update ${JOB_SCHEMA}.version set version = version - 1`,
      );
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      let recorded: readonly RecordedStatement[] = [];
      let warnings: unknown[][] = [];
      try {
        recorded = await record('replace', async (forPhase) => {
          await installJobSchema(forPhase('install'), JOB_SCHEMA);
        });
        // Read before restoring: `mockRestore` resets the recorded calls too.
        warnings = warn.mock.calls;
      } finally {
        warn.mockRestore();
      }

      expect(textsOf(recorded, 'install')).toEqual([
        `select to_regclass('${JOB_SCHEMA}.version') is not null as present`,
        `select version from ${JOB_SCHEMA}.version`,
        `select count(*)::text from ${JOB_SCHEMA}.job`,
        `drop schema ${JOB_SCHEMA} cascade`,
        nestedConstructionPlan(),
        jobGrantsSql(JOB_SCHEMA),
      ]);
      expect(warnings).toEqual([
        [
          `Replacing pg-boss schema ${JOB_SCHEMA} (version ${JOB_SCHEMA_VERSION - 1}) with version ${JOB_SCHEMA_VERSION}; 0 job(s) are discarded.`,
        ],
      ]);
      expect(transactionControlIn(recorded, 'install')).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );
});
