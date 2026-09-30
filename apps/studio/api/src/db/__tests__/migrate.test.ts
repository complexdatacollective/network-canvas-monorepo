import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { renderSchemaDdl } from '../../../scripts/render-schema-ddl.ts';
import { refusalOf } from '../../__tests__/support/database.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { installJobSchema } from '../../jobs/install.ts';
import { JOB_SCHEMA } from '../../jobs/queues.ts';
import { OwnerDatabase } from '../client.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import {
  fingerprintOfDdl,
  migrateDatabaseEffect,
  type SchemaDdl,
  SchemaDdlMismatch,
  StaleDatabase,
  verifySchemaDdl,
} from '../migrate.ts';
import { checkSchema, SCHEMA_LOCK_KEY, stampFingerprint } from '../schema.ts';

// `studio-api migrate` against a real, empty database — the one-shot a
// deployment runs before anything else starts (#1909).
//
// It is proved here rather than through the container because what could go
// wrong is the SQL: the statements are rendered at build time from the same
// definitions `apply-schema` pushes, and executing them has to leave a database
// every process reads as `current`. The container proves the command is wired
// to this; this proves the command does the work.

const db = await reachableDb();

/** Rendering the DDL imports drizzle-kit and diffs the whole schema. */
const RENDER_TIMEOUT_MS = 180_000;
const CASE_TIMEOUT_MS = 120_000;

/** One force-drop per scratch database this file created, run one at a time. */
const DISPOSE_TIMEOUT_MS = 120_000;

describe('the rendered schema DDL', () => {
  it(
    'round-trips to this build’s fingerprint',
    async () => {
      // What the build writes to dist/schema-ddl.json. `renderSchemaDdl` already
      // refuses a mismatch, so this asserts the hash independently rather than
      // trusting that refusal: a render function that stopped checking would
      // otherwise ship a document describing some other schema.
      const ddl = await renderSchemaDdl();
      expect(ddl.fingerprint).toBe(SCHEMA_FINGERPRINT);
      expect(fingerprintOfDdl(ddl)).toBe(SCHEMA_FINGERPRINT);
      expect(ddl.statements.length).toBeGreaterThan(0);
      expect(ddl.jobStatements.length).toBeGreaterThan(0);
    },
    RENDER_TIMEOUT_MS,
  );

  it('refuses a document another build rendered', async () => {
    const ddl = await renderSchemaDdl();
    expect(() =>
      verifySchemaDdl({ ...ddl, fingerprint: 'f'.repeat(64) }),
    ).toThrow(SchemaDdlMismatch);
  });

  it('refuses a document that does not hash to its own fingerprint', async () => {
    // A truncated or hand-edited file: the fingerprint beside the statements
    // still says this build, and the statements no longer are.
    const ddl = await renderSchemaDdl();
    expect(() =>
      verifySchemaDdl({ ...ddl, statements: ddl.statements.slice(0, -1) }),
    ).toThrow(SchemaDdlMismatch);
  });
});

// The deployed path, on `@effect/sql-pg`: the only migrate there is.
//
// The driver has no simple-query path, so the DDL is cut into single
// statements by `splitStatements` before it is sent, and this suite is the
// splitter's real oracle. A splitter that cut a `plpgsql` body in half, or
// dropped a statement, or merged two, fails here as a `42601` or as a database
// that does not read `current` — which is what the mutation "skip
// `splitStatements` on one sidecar" demonstrates.
//
// Fixtures and oracles run on the scratch database's node-postgres owner pool,
// and the verdict is read back through the node-postgres `checkSchema` — the
// one the scripts and the schema gate run — so the database the Effect path
// leaves behind is judged by the other reader too.
describe.skipIf(!db)('migrate', () => {
  let ddl: SchemaDdl;

  beforeAll(async () => {
    ddl = await renderSchemaDdl();
  }, RENDER_TIMEOUT_MS);

  const scratches: { dispose: () => Promise<void> }[] = [];

  async function emptyDatabase() {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createScratchDatabase(db);
    scratches.push(scratch);
    return scratch;
  }

  // Sequential, and given a window of its own: each dispose force-drops a
  // database, and several at once on one cluster outran the file's default
  // hook budget once this file grew to five of them.
  afterAll(async () => {
    for (const scratch of scratches) {
      await scratch.dispose().catch(() => undefined);
    }
  }, DISPOSE_TIMEOUT_MS);

  const ownerLayer = (url: string) =>
    OwnerDatabase.layer({ url, applicationName: 'studio-migrate-test' });

  /** The migrate program, run against one scratch database as its owner. */
  const runMigrate = (
    url: string,
    options?: { log?: (line: string) => void },
  ) =>
    Effect.runPromise(
      migrateDatabaseEffect(ddl, options).pipe(Effect.provide(ownerLayer(url))),
    );

  /**
   * What a migrate that had to fail failed with, read off its whole cause:
   * the SQLSTATE and every message down the chain, where the backend's own
   * words arrive. `NOT_REFUSED` in every field when it succeeded.
   */
  const migrateRefusal = (url: string) =>
    Effect.runPromise(
      refusalOf(migrateDatabaseEffect(ddl)).pipe(
        Effect.provide(ownerLayer(url)),
      ),
    );

  it(
    'creates a schema every process reads as current',
    async () => {
      const scratch = await emptyDatabase();
      expect((await checkSchema(scratch.pool)).kind).toBe('absent');

      const lines: string[] = [];
      const outcome = await runMigrate(scratch.db.url, {
        log: (line) => lines.push(line),
      });

      expect(outcome).toEqual({ kind: 'applied' });
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
      expect(lines.at(-1)).toBe('Schema applied.');

      // The queue's schema is inside the same transaction and before the
      // stamp, so a database this build stamped carries it.
      const jobs = await scratch.pool.query<{ present: boolean }>(
        `select exists (select 1 from pg_namespace where nspname = $1) as present`,
        [JOB_SCHEMA],
      );
      expect(jobs.rows[0]?.present).toBe(true);

      // The roles the server's pools pin themselves to, which the sidecars
      // create: without them every pool is refused at connect.
      const roles = await scratch.pool.query<{ rolname: string }>(
        `select rolname from pg_roles where rolname in ('studio_app', 'studio_maintenance') order by rolname`,
      );
      expect(roles.rows.map((row) => row.rolname)).toEqual([
        'studio_app',
        'studio_maintenance',
      ]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'creates the native job schema with its grants',
    async () => {
      // The queue's schema is in `SCHEMA_FINGERPRINT`, so a database this
      // build stamped has to carry it — which makes the stamp, and not a later
      // migration, what this case is really about.
      const scratch = await emptyDatabase();
      const lines: string[] = [];
      await runMigrate(scratch.db.url, {
        log: (line) => lines.push(line),
      });

      expect(lines).toContain(`Installing the ${JOB_SCHEMA} schema.`);

      const tables = await scratch.pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_schema = $1 order by 1`,
        [JOB_SCHEMA],
      );
      const names = tables.rows.map((row) => row.table_name);
      expect(names).toContain('jobs');
      expect(names).toContain('job_schedules');

      // The grants are the half a `CREATE TABLE` cannot imply, and the half
      // that decides what a compromised web process could read: the
      // application may insert a job and read back the id its insert returns,
      // and may not see a payload, a queue name, or anything it could claim,
      // retry or delete a job with. The worker runs as maintenance and owns
      // both tables.
      const privileges = await scratch.pool.query<Record<string, boolean>>(
        `select
           has_schema_privilege('studio_app', $1, 'USAGE') as app_schema,
           has_table_privilege('studio_app', $1 || '.jobs', 'INSERT') as app_insert,
           has_column_privilege('studio_app', $1 || '.jobs', 'id', 'SELECT') as app_id,
           has_column_privilege('studio_app', $1 || '.jobs', 'payload', 'SELECT') as app_payload,
           has_column_privilege('studio_app', $1 || '.jobs', 'queue', 'SELECT') as app_queue,
           has_table_privilege('studio_app', $1 || '.jobs', 'UPDATE') as app_update,
           has_table_privilege('studio_app', $1 || '.jobs', 'DELETE') as app_delete,
           has_table_privilege('studio_app', $1 || '.job_schedules', 'SELECT') as app_schedules,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'SELECT') as maintenance_select,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'INSERT') as maintenance_insert,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'UPDATE') as maintenance_update,
           has_table_privilege('studio_maintenance', $1 || '.jobs', 'DELETE') as maintenance_delete,
           has_table_privilege('studio_maintenance', $1 || '.job_schedules', 'INSERT') as maintenance_schedules`,
        [JOB_SCHEMA],
      );
      expect(privileges.rows[0]).toEqual({
        app_schema: true,
        app_insert: true,
        app_id: true,
        app_payload: false,
        app_queue: false,
        app_update: false,
        app_delete: false,
        app_schedules: false,
        maintenance_select: true,
        maintenance_insert: true,
        maintenance_update: true,
        maintenance_delete: true,
        maintenance_schedules: true,
      });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'is a no-op the second time, and changes nothing',
    async () => {
      const scratch = await emptyDatabase();
      await runMigrate(scratch.db.url);

      const before = await scratch.pool.query<{
        fingerprint: string;
        appliedAt: Date;
      }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');

      const lines: string[] = [];
      const outcome = await runMigrate(scratch.db.url, {
        log: (line) => lines.push(line),
      });

      expect(outcome).toEqual({ kind: 'current' });
      expect(lines).toEqual(['Schema current.']);
      // The stamp row is the oracle for "wrote nothing": a second run that
      // re-applied would restamp it, and re-running the DDL over live tables
      // would have failed on the first CREATE TABLE anyway.
      const after = await scratch.pool.query<{
        fingerprint: string;
        appliedAt: Date;
      }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');
      expect(after.rows).toEqual(before.rows);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'refuses a database another build created, without touching it',
    async () => {
      const scratch = await emptyDatabase();
      await runMigrate(scratch.db.url);

      const other = 'a'.repeat(64);
      await stampFingerprint(scratch.pool, other);

      const refusal: unknown = await runMigrate(scratch.db.url).then(
        () => 'no failure',
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(StaleDatabase);
      // Both fingerprints named, so an operator can tell which build is which,
      // and the reason it will not be reconciled.
      const message = refusal instanceof Error ? refusal.message : '';
      expect(message).toMatch(new RegExp(other.slice(0, 12)));
      expect(message).toMatch(new RegExp(SCHEMA_FINGERPRINT.slice(0, 12)));
      expect(message).toMatch(/#1901/);

      // Unchanged: the refusal is a refusal, not a half-applied upgrade.
      const stamp = await scratch.pool.query<{ fingerprint: string }>(
        'select "fingerprint" from "schemaFingerprint"',
      );
      expect(stamp.rows).toEqual([{ fingerprint: other }]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'installs the job schema inside the caller’s transaction',
    async () => {
      // The node-postgres `installJobSchema`, which `applySchema`
      // (scripts/apply.ts) runs inside its one transaction, must carry no
      // transaction control of its own: a COMMIT anywhere inside it would make
      // everything applied before that point durable — no error, no warning
      // anyone reads. `migrate`'s own install, on the Effect path, is held to
      // the same by the two rollback cases below.
      //
      // The marker table is the oracle: it is written before the install and
      // rolled back after it, so it survives only if something in between
      // committed.
      const scratch = await emptyDatabase();
      const client = await scratch.pool.connect();
      try {
        await client.query('begin');
        await client.query('create table rollback_marker (id int)');
        await installJobSchema(client, JOB_SCHEMA);
        await client.query('rollback');
      } finally {
        client.release();
      }

      const after = await scratch.pool.query<{
        marker: boolean;
        jobs: boolean;
      }>(
        `select to_regclass('rollback_marker') is not null as marker,
                exists (select 1 from pg_namespace where nspname = $1) as jobs`,
        [JOB_SCHEMA],
      );
      expect(after.rows[0]).toEqual({ marker: false, jobs: false });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'leaves an empty database behind when a step fails, and applies next time',
    async () => {
      // A failure at the last step that can have one: a database that already
      // carries a `studio_jobs.jobs` of some other shape, so the install gets
      // past `CREATE TABLE IF NOT EXISTS` and fails on the first index, whose
      // predicate names a column that relation does not have — after the
      // public schema has been applied inside the same transaction.
      //
      // A partial application is not a half-working database. The next run
      // reads tables with no fingerprint as `stale` and REFUSES it, so an
      // operator whose first migrate died halfway would be told to recreate a
      // database that had never worked. Rolling back to empty means the next
      // run simply applies.
      const scratch = await emptyDatabase();
      // Created outside the transaction under test, so the rollback below
      // cannot be credited with removing it: what has to disappear is
      // everything `migrate` itself wrote.
      await scratch.pool.query(`create schema ${JOB_SCHEMA}`);
      await scratch.pool.query(
        `create table ${JOB_SCHEMA}.jobs (id uuid primary key)`,
      );

      const refusal = await migrateRefusal(scratch.db.url);
      expect(refusal.state).toBe('42703');
      expect(refusal.message).toMatch(/column "state" does not exist/);

      // Nothing `migrate` wrote survives: not the tables, not the stamp.
      // `checkSchema` reporting `absent` rather than `stale` is the whole
      // point — `stale` is the verdict that refuses, so a database left
      // half-applied is one the next run will not fix.
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'absent' });
      const relations = await scratch.pool.query<{ count: string }>(
        `select count(*)::text from pg_tables where schemaname = 'public'`,
      );
      expect(relations.rows[0]?.count).toBe('0');

      // And what the install did manage before it failed is gone too: the
      // job schema is outside `public`, where `checkSchema` does not look.
      const jobTables = await scratch.pool.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = $1 order by 1`,
        [JOB_SCHEMA],
      );
      expect(jobTables.rows.map((row) => row.tablename)).toEqual(['jobs']);

      // And with the obstruction removed, the same database applies cleanly.
      await scratch.pool.query(`drop schema ${JOB_SCHEMA} cascade`);
      expect(await runMigrate(scratch.db.url)).toEqual({ kind: 'applied' });
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'takes the job schema down with a public step that fails after it',
    async () => {
      // The case above from the other side. There the install is the step
      // that fails, so it proves nothing about an install that runs somewhere
      // else: one hoisted out of the transaction entirely would fail in the
      // same place and leave the same empty database behind. Here the install
      // succeeds and a public statement after it fails, which is the only
      // arrangement that can tell the two apart — a job schema committed on
      // its own before the apply began would survive this rollback, leaving a
      // database carrying half of what the stamp vouches for.
      //
      // The obstruction is an empty `schemaFingerprint` of the wrong shape.
      // It is the one table the DDL creates that the staleness probe ignores,
      // and with no row in it the verdict is still `absent` — so the run gets
      // past the read and dies inside the transaction, on the `CREATE TABLE`
      // that names it, a hundred-odd public statements in.
      const scratch = await emptyDatabase();
      await scratch.pool.query(
        `create table "schemaFingerprint" ("fingerprint" text, "appliedAt" timestamp with time zone)`,
      );
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'absent' });

      const refusal = await migrateRefusal(scratch.db.url);
      expect(refusal.state).toBe('42P07');
      expect(refusal.message).toMatch(
        /relation "schemaFingerprint" already exists/,
      );

      // The oracle: `migrate` installs the job schema inside the transaction
      // that applies the public one, so a public step that fails takes the
      // job schema with it. An install that ran before that transaction
      // committed itself, and this would find it still here.
      const installed = await scratch.pool.query<{ present: boolean }>(
        'select exists (select 1 from pg_namespace where nspname = $1) as present',
        [JOB_SCHEMA],
      );
      expect(installed.rows[0]).toEqual({ present: false });

      // And nothing of the public schema survives either, beyond the
      // obstruction this case put there itself.
      const tables = await scratch.pool.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public' order by 1`,
      );
      expect(tables.rows.map((row) => row.tablename)).toEqual([
        'schemaFingerprint',
      ]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'refuses a database carrying tables but no fingerprint',
    async () => {
      // The `unstamped` verdict: a database whose SQL is unknown. Adopting it
      // would launder exactly the staleness the fingerprint exists to catch.
      const scratch = await emptyDatabase();
      await runMigrate(scratch.db.url);
      await scratch.pool.query('delete from "schemaFingerprint"');

      const refusal: unknown = await runMigrate(scratch.db.url).then(
        () => 'no failure',
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(StaleDatabase);
      expect(refusal instanceof Error ? refusal.message : '').toMatch(
        /no fingerprint/,
      );
    },
    CASE_TIMEOUT_MS,
  );
  it(
    'serialises two concurrent migrates, so only one applies',
    async () => {
      const scratch = await emptyDatabase();

      // Both start against an empty database. The advisory lock is held on a
      // reserved connection across `checkSchema`, so the loser reads the
      // database only after the winner has committed — and reads it as
      // current. Without the lock spanning the read, both would find it
      // absent and both would apply.
      const [first, second] = await Promise.all([
        runMigrate(scratch.db.url),
        runMigrate(scratch.db.url),
      ]);

      expect([first, second].map((outcome) => outcome.kind).toSorted()).toEqual(
        ['applied', 'current'],
      );
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'holds the advisory lock across the whole run',
    async () => {
      const scratch = await emptyDatabase();
      await runMigrate(scratch.db.url);

      // And gives it back: a migrate that leaked its session lock would make
      // every later one block forever. Taken on a fresh connection, so this is
      // the lock's real state and not a re-entrant grant.
      const held = await scratch.pool.query<{ free: boolean }>(
        `select pg_try_advisory_lock($1) as free`,
        [SCHEMA_LOCK_KEY],
      );
      expect(held.rows[0]?.free).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );
});
