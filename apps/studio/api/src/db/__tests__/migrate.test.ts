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

const db = await reachableDb();

const RENDER_TIMEOUT_MS = 180_000;
const CASE_TIMEOUT_MS = 120_000;

const DISPOSE_TIMEOUT_MS = 120_000;

describe('the rendered schema DDL', () => {
  it(
    'round-trips to this build’s fingerprint',
    async () => {
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

  // Sequential: several force-drops at once on one cluster outran the
  // hook budget.
  afterAll(async () => {
    for (const scratch of scratches) {
      await scratch.dispose().catch(() => undefined);
    }
  }, DISPOSE_TIMEOUT_MS);

  const ownerLayer = (url: string) =>
    OwnerDatabase.layer({ url, applicationName: 'studio-migrate-test' });

  const runMigrate = (
    url: string,
    options?: { log?: (line: string) => void },
  ) =>
    Effect.runPromise(
      migrateDatabaseEffect(ddl, options).pipe(Effect.provide(ownerLayer(url))),
    );

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

      const jobs = await scratch.pool.query<{ present: boolean }>(
        `select exists (select 1 from pg_namespace where nspname = $1) as present`,
        [JOB_SCHEMA],
      );
      expect(jobs.rows[0]?.present).toBe(true);

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
      const message = refusal instanceof Error ? refusal.message : '';
      expect(message).toMatch(new RegExp(other.slice(0, 12)));
      expect(message).toMatch(new RegExp(SCHEMA_FINGERPRINT.slice(0, 12)));
      expect(message).toMatch(/#1901/);

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
      const scratch = await emptyDatabase();
      await scratch.pool.query(`create schema ${JOB_SCHEMA}`);
      await scratch.pool.query(
        `create table ${JOB_SCHEMA}.jobs (id uuid primary key)`,
      );

      const refusal = await migrateRefusal(scratch.db.url);
      expect(refusal.state).toBe('42703');
      expect(refusal.message).toMatch(/column "state" does not exist/);

      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'absent' });
      const relations = await scratch.pool.query<{ count: string }>(
        `select count(*)::text from pg_tables where schemaname = 'public'`,
      );
      expect(relations.rows[0]?.count).toBe('0');

      const jobTables = await scratch.pool.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = $1 order by 1`,
        [JOB_SCHEMA],
      );
      expect(jobTables.rows.map((row) => row.tablename)).toEqual(['jobs']);

      await scratch.pool.query(`drop schema ${JOB_SCHEMA} cascade`);
      expect(await runMigrate(scratch.db.url)).toEqual({ kind: 'applied' });
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'takes the job schema down with a public step that fails after it',
    async () => {
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

      const installed = await scratch.pool.query<{ present: boolean }>(
        'select exists (select 1 from pg_namespace where nspname = $1) as present',
        [JOB_SCHEMA],
      );
      expect(installed.rows[0]).toEqual({ present: false });

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

      const held = await scratch.pool.query<{ free: boolean }>(
        `select pg_try_advisory_lock($1) as free`,
        [SCHEMA_LOCK_KEY],
      );
      expect(held.rows[0]?.free).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );
});
