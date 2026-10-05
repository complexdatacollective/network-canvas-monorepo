import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JOB_QUEUES, JOB_SCHEMA } from '@codaco/studio-sync/jobs';

import { renderSchemaDdl } from '../../../scripts/render-schema-ddl.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { installJobSchema } from '../../jobs/install.ts';
import { renderJobStatements } from '../../jobs/queues.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import {
  fingerprintOfDdl,
  migrateDatabase,
  type SchemaDdl,
  SchemaDdlMismatch,
  StaleDatabase,
  verifySchemaDdl,
} from '../migrate.ts';
import { checkSchema, stampFingerprint } from '../schema.ts';

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

  it(
    'creates a schema every process reads as current',
    async () => {
      const scratch = await emptyDatabase();
      expect((await checkSchema(scratch.pool)).kind).toBe('absent');

      const lines: string[] = [];
      const outcome = await migrateDatabase(scratch.pool, ddl, {
        log: (line) => lines.push(line),
      });

      expect(outcome).toEqual({ kind: 'applied' });
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
      expect(lines.at(-1)).toBe('Schema applied.');

      // Not merely "tables exist": the queues are what the worker fetches from
      // and the web process enqueues on, and they are created through pg-boss's
      // own API rather than by the DDL — so a migrate that ran the statements
      // and stopped would leave a database that boots and can queue nothing.
      const queues = await scratch.pool.query<{ name: string }>(
        `select name from ${JOB_SCHEMA}.queue order by name`,
      );
      expect(queues.rows.map((row) => row.name)).toEqual(
        JOB_QUEUES.map(({ name }) => name).toSorted(),
      );

      // And the roles the server's pools pin themselves to, which the sidecars
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
    'is a no-op the second time, and changes nothing',
    async () => {
      const scratch = await emptyDatabase();
      await migrateDatabase(scratch.pool, ddl);

      const before = await scratch.pool.query<{
        fingerprint: string;
        appliedAt: Date;
      }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');

      const lines: string[] = [];
      const outcome = await migrateDatabase(scratch.pool, ddl, {
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
      await migrateDatabase(scratch.pool, ddl);

      const other = 'a'.repeat(64);
      await stampFingerprint(scratch.pool, other);

      await expect(migrateDatabase(scratch.pool, ddl)).rejects.toThrow(
        StaleDatabase,
      );
      // Both fingerprints named, so an operator can tell which build is which,
      // and the reason it will not be reconciled.
      await expect(migrateDatabase(scratch.pool, ddl)).rejects.toThrow(
        new RegExp(other.slice(0, 12)),
      );
      await expect(migrateDatabase(scratch.pool, ddl)).rejects.toThrow(
        new RegExp(SCHEMA_FINGERPRINT.slice(0, 12)),
      );
      await expect(migrateDatabase(scratch.pool, ddl)).rejects.toThrow(/#1901/);

      // Unchanged: the refusal is a refusal, not a half-applied upgrade.
      const stamp = await scratch.pool.query<{ fingerprint: string }>(
        'select "fingerprint" from "schemaFingerprint"',
      );
      expect(stamp.rows).toEqual([{ fingerprint: other }]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "runs pg-boss's construction plan inside the caller's transaction",
    async () => {
      // The statement that would otherwise defeat every other guarantee here.
      // `getConstructionPlans` returns a self-contained `BEGIN…COMMIT` script:
      // run unaltered on a client that already has a transaction open, its
      // COMMIT commits THAT transaction — no error, no warning anyone reads —
      // and everything applied before it becomes durable. `installJobSchema`
      // strips that outer transaction control, always, so there is no flag a
      // caller can forget.
      //
      // The marker table is the oracle: it is written before the plan and
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
      // The failure that made atomicity necessary, at the last step that can
      // have one: a queue whose policy the declaration no longer matches.
      // `syncJobQueues` refuses that outright — pg-boss cannot change a policy
      // after creation — and it refuses it AFTER the public schema and
      // pg-boss's own have been applied.
      //
      // A partial application is not a half-working database. The next run
      // reads tables with no fingerprint as `stale` and REFUSES it, so an
      // operator whose first migrate died halfway would be told to recreate a
      // database that had never worked. Rolling back to empty means the next
      // run simply applies.
      const scratch = await emptyDatabase();
      // Installed outside the transaction under test, so the rollback below
      // cannot be credited with removing it: what has to disappear is
      // everything `migrate` itself wrote.
      // Through the server's own renderer rather than pg-boss directly: the
      // job source policy keeps that import to src/jobs (source-policy.test.ts),
      // and these are the same two statements `installJobSchema` would run.
      const [plan, grants] = renderJobStatements();
      await scratch.pool.query(plan!);
      await scratch.pool.query(grants!);
      const [conflicting] = JOB_QUEUES;
      // Declared `standard`; installed here as `singleton`.
      await scratch.pool.query(
        `select ${JOB_SCHEMA}.create_queue($1, $2::jsonb)`,
        [conflicting.name, JSON.stringify({ policy: 'singleton' })],
      );

      await expect(migrateDatabase(scratch.pool, ddl)).rejects.toThrow(
        /policy/,
      );

      // Nothing `migrate` wrote survives: not the tables, not the stamp.
      // `checkSchema` reporting `absent` rather than `stale` is the whole
      // point — `stale` is the verdict that refuses, so a database left
      // half-applied is one the next run will not fix.
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'absent' });
      const relations = await scratch.pool.query<{ count: string }>(
        `select count(*)::text from pg_tables where schemaname = 'public'`,
      );
      expect(relations.rows[0]?.count).toBe('0');

      // And with the conflict removed — the remedy `syncJobQueues` names —
      // the same database applies cleanly.
      await scratch.pool.query(`select ${JOB_SCHEMA}.delete_queue($1)`, [
        conflicting.name,
      ]);
      expect(await migrateDatabase(scratch.pool, ddl)).toEqual({
        kind: 'applied',
      });
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'refuses a database carrying tables but no fingerprint',
    async () => {
      // The `unstamped` verdict: a database whose SQL is unknown. Adopting it
      // would launder exactly the staleness the fingerprint exists to catch.
      const scratch = await emptyDatabase();
      await migrateDatabase(scratch.pool, ddl);
      await scratch.pool.query('delete from "schemaFingerprint"');

      await expect(migrateDatabase(scratch.pool, ddl)).rejects.toThrow(
        /no fingerprint/,
      );
    },
    CASE_TIMEOUT_MS,
  );
});
