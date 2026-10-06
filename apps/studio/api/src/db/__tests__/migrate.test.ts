import { randomUUID } from 'node:crypto';

import { Effect, Layer } from 'effect';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { refusalOf } from '../../__tests__/support/database.ts';
import {
  committedDocument,
  ownedScratchDatabaseForTest,
  type OwnedScratchDatabase,
  type SyntheticMigration,
  withMigrations,
} from '../../__tests__/support/migrations.ts';
import {
  enqueueAsApplication,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { JobClock } from '../../jobs/clock.ts';
import { Jobs } from '../../jobs/jobs.ts';
import { JOB_SCHEMA } from '../../jobs/queues.ts';
import { JobWorker } from '../../jobs/worker.ts';
import { MaintenanceDatabase, OwnerDatabase } from '../client.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import { MigrationHistoryRefused } from '../history.ts';
import {
  assertSessionState,
  migrateDatabaseEffect,
  type MigrateOptions,
  readSessionState,
  readVerifiedMigrations,
} from '../migrate.ts';
import {
  type MigrationsDocument,
  MigrationsDocumentRefused,
  verifyMigrations,
} from '../migrations-document.ts';
import { checkSchema, SCHEMA_LOCK_KEY } from '../schema.ts';
import { OwnerScope, Transaction } from '../tenant.ts';

const db = await reachableDb();

const CASE_TIMEOUT_MS = 180_000;

/** A fingerprint no real schema has: the target of a synthetic release. */
const NEXT = 'b'.repeat(64);
const AFTER_NEXT = 'c'.repeat(64);

describe.skipIf(!db)('migrate', () => {
  const committed = committedDocument();

  async function emptyDatabase(): Promise<OwnedScratchDatabase> {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await ownedScratchDatabaseForTest(db);
    return scratch;
  }

  const ownerLayer = (url: string) =>
    OwnerDatabase.layer({ url, applicationName: 'studio-migrate-test' });

  const run = (
    url: string,
    document: MigrationsDocument = committed,
    options: MigrateOptions = {},
  ) =>
    Effect.runPromise(
      migrateDatabaseEffect(verifyMigrations(document, document.fingerprint), {
        appliedBy: 'test',
        ...options,
      }).pipe(Effect.provide(ownerLayer(url))),
    );

  /** Rejects when the run succeeds, so a missing refusal fails the test. */
  const refusal = (url: string, document: MigrationsDocument = committed) =>
    Effect.runPromise(
      Effect.flip(
        migrateDatabaseEffect(
          verifyMigrations(document, document.fingerprint),
        ).pipe(Effect.provide(ownerLayer(url))),
      ),
    );

  /** A database error, read through every link of its cause. */
  const sqlRefusal = (url: string, document: MigrationsDocument) =>
    Effect.runPromise(
      refusalOf(
        migrateDatabaseEffect(verifyMigrations(document, document.fingerprint)),
      ).pipe(Effect.provide(ownerLayer(url))),
    );

  const next = (...extra: SyntheticMigration[]) =>
    withMigrations(committed, ...extra);

  const committedSidecars = (): string => {
    const sidecars = committed.migrations
      .at(-1)
      ?.artefacts.find(({ name }) => name === 'sidecars.sql')?.sql;
    if (sidecars === undefined) throw new Error('no committed sidecars');
    return sidecars;
  };

  const history = async (pool: pg.Pool) =>
    (
      await pool.query<{ version: string; ordinal: number }>(
        'select version, ordinal from studio_migrations order by ordinal',
      )
    ).rows;

  const stamp = async (pool: pg.Pool) =>
    (
      await pool.query<{ fingerprint: string }>(
        'select "fingerprint" from "schemaFingerprint"',
      )
    ).rows.map((row) => row.fingerprint);

  const publicTables = async (pool: pg.Pool) =>
    (
      await pool.query<{ tablename: string }>(
        `select tablename from pg_tables where schemaname = 'public' order by 1`,
      )
    ).rows.map((row) => row.tablename);

  const committedVersions = committed.migrations.map(
    ({ version, ordinal }) => ({
      version,
      ordinal,
    }),
  );

  it('carries at least one committed migration', () => {
    expect(committed.migrations.length).toBeGreaterThan(0);
    expect(committed.fingerprint).toBe(SCHEMA_FINGERPRINT);
  });

  it(
    'applies every committed migration to an empty database, records each, and stamps it',
    async () => {
      const scratch = await emptyDatabase();
      expect((await checkSchema(scratch.pool)).kind).toBe('absent');

      const lines: string[] = [];
      const outcome = await run(scratch.db.url, committed, {
        log: (line) => lines.push(line),
        appliedBy: '9.9.9',
      });

      expect(outcome).toEqual({
        kind: 'applied',
        versions: committedVersions.map(({ version }) => version),
      });
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
      expect(await history(scratch.pool)).toEqual(committedVersions);
      const recorded = await scratch.pool.query<{
        applied_by: string;
        manifest_hash: string;
      }>(
        'select applied_by, manifest_hash from studio_migrations order by ordinal',
      );
      expect(recorded.rows).toEqual(
        committed.migrations.map(({ manifest }) => ({
          applied_by: '9.9.9',
          manifest_hash: manifest.combined,
        })),
      );
      expect(lines.at(-1)).toMatch(/^Applied /);

      const jobs = await scratch.pool.query<{ present: boolean }>(
        `select exists (select 1 from pg_namespace where nspname = $1) as present`,
        [JOB_SCHEMA],
      );
      expect(jobs.rows[0]?.present).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'is a no-op on a current database, and writes nothing',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);

      // `xmin` moves on any write to a row, including an update to the same
      // values, and `pg_class.xmin` moves on any DDL or grant against the
      // table. Together they see a re-stamp, a re-record, a re-create and a
      // re-revoke.
      const fingerprintRows = () =>
        scratch.pool.query(
          'select xmin::text, "fingerprint", "appliedAt" from "schemaFingerprint"',
        );
      const historyRows = () =>
        scratch.pool.query(
          'select xmin::text, * from studio_migrations order by ordinal',
        );
      const historyCatalog = () =>
        scratch.pool.query(
          `select xmin::text, relacl::text from pg_class where oid = 'public.studio_migrations'::regclass`,
        );
      const before = [
        (await fingerprintRows()).rows,
        (await historyRows()).rows,
        (await historyCatalog()).rows,
      ];

      const lines: string[] = [];
      expect(
        await run(scratch.db.url, committed, {
          log: (line) => lines.push(line),
        }),
      ).toEqual({ kind: 'current' });
      expect(lines).toEqual(['Schema current.']);

      const after = [
        (await fingerprintRows()).rows,
        (await historyRows()).rows,
        (await historyCatalog()).rows,
      ];
      expect(before[1]).toHaveLength(committed.migrations.length);
      expect(after).toEqual(before);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'applies only what is pending, and stamps the newest fingerprint',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);

      const outcome = await run(
        scratch.db.url,
        next({
          slug: 'probe_column',
          delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
          fingerprint: NEXT,
        }),
      );

      expect(outcome).toEqual({
        kind: 'applied',
        versions: [
          `${String(committed.migrations.length + 1).padStart(4, '0')}_probe_column`,
        ],
      });
      expect(await stamp(scratch.pool)).toEqual([NEXT]);
      expect((await history(scratch.pool)).length).toBe(
        committed.migrations.length + 1,
      );
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'refuses a database carrying tables but no history, without touching it',
    async () => {
      const scratch = await emptyDatabase();
      await scratch.pool.query('create table "user" (id text primary key)');

      const failure = await refusal(scratch.db.url);
      expect(failure).toBeInstanceOf(MigrationHistoryRefused);
      expect(failure.message).toMatch(/no migration history/);
      expect(failure.message).toMatch(/Recreate it/);
      expect(await publicTables(scratch.pool)).toEqual(['user']);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'serialises two concurrent migrates, so only one applies',
    async () => {
      const scratch = await emptyDatabase();

      const outcomes = await Promise.all([
        run(scratch.db.url),
        run(scratch.db.url),
      ]);

      expect(outcomes.map((outcome) => outcome.kind).toSorted()).toEqual([
        'applied',
        'current',
      ]);
      expect(await history(scratch.pool)).toEqual(committedVersions);
      expect(await checkSchema(scratch.pool)).toEqual({ kind: 'current' });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'holds the lock on its own session across the history read and the transaction',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);

      // The backfill blocks on a lock the test holds, so the run is caught
      // inside its transaction.
      const gateKey = 4021775688147199;
      const gate = await scratch.admin.connect();
      try {
        await gate.query('select pg_advisory_lock($1)', [gateKey]);
        const running = run(
          scratch.db.url,
          next({
            slug: 'gated',
            backfill: `select pg_advisory_xact_lock(${gateKey});`,
            fingerprint: NEXT,
          }),
        );
        running.catch(() => undefined);

        // Advisory locks are per database, and other suites take the same
        // keys in their own scratch databases on this cluster.
        const waiters = async () =>
          (
            await scratch.admin.query<{ pid: number }>(
              `select pid from pg_locks
                where locktype = 'advisory' and not granted
                  and database = (select oid from pg_database where datname = current_database())
                  and objid = ($1::bigint & 4294967295)::oid
                  and classid = ($1::bigint >> 32)::oid`,
              [gateKey],
            )
          ).rows.map((row) => row.pid);
        await expect
          .poll(waiters, { timeout: 60_000, interval: 100 })
          .toHaveLength(1);
        // The backend waiting on the gate is the migration transaction's.
        const [transactionPid] = await waiters();

        const contender = await scratch.admin.query<{ free: boolean }>(
          'select pg_try_advisory_lock($1) as free',
          [SCHEMA_LOCK_KEY],
        );
        expect(contender.rows[0]?.free).toBe(false);
        // The lock is a session lock, not a table lock: the pool still serves.
        const ordinary = await scratch.admin.query<{ one: number }>(
          'select 1 as one',
        );
        expect(ordinary.rows[0]?.one).toBe(1);
        // The lock and the transaction are on different sessions: one
        // backend holds the schema lock in this database, and it is not the
        // one running the transaction (an xact lock taken inside the
        // transaction would be held by the waiting backend itself).
        const holders = await scratch.admin.query<{ pid: number }>(
          `select distinct pid from pg_locks
            where locktype = 'advisory' and granted
              and database = (select oid from pg_database where datname = current_database())
              and objid = ($1::bigint & 4294967295)::oid
              and classid = ($1::bigint >> 32)::oid`,
          [SCHEMA_LOCK_KEY],
        );
        expect(holders.rows).toHaveLength(1);
        expect(transactionPid).toEqual(expect.any(Number));
        expect(holders.rows[0]?.pid).not.toBe(transactionPid);

        await gate.query('select pg_advisory_unlock($1)', [gateKey]);
        expect((await running).kind).toBe('applied');
      } finally {
        gate.release();
      }

      const released = await scratch.admin.query<{ free: boolean }>(
        'select pg_try_advisory_lock($1) as free',
        [SCHEMA_LOCK_KEY],
      );
      expect(released.rows[0]?.free).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'stamps the fingerprint inside the transaction that records the history',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);
      const before = await history(scratch.pool);

      // A second session holds the stamp row, so the run is caught at the
      // stamp; a third reads what the run has committed so far.
      const holder = await scratch.admin.connect();
      try {
        await holder.query('begin');
        await holder.query('select * from "schemaFingerprint" for update');
        const running = run(
          scratch.db.url,
          next({
            slug: 'stamped',
            delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
            fingerprint: NEXT,
          }),
        );
        running.catch(() => undefined);

        await expect
          .poll(
            async () =>
              (
                await scratch.admin.query<{ query: string }>(
                  `select query from pg_stat_activity
                    where datname = current_database() and wait_event_type = 'Lock'`,
                )
              ).rows.map((row) => row.query),
            { timeout: 60_000, interval: 100 },
          )
          .toEqual([expect.stringMatching(/"schemaFingerprint"/)]);

        // Were the stamp written in a later transaction, the history row
        // would already be committed while that one waits.
        expect(await history(scratch.pool)).toEqual(before);

        await holder.query('rollback');
        expect((await running).kind).toBe('applied');
      } finally {
        holder.release();
      }
      expect((await history(scratch.pool)).length).toBe(before.length + 1);
      expect(await stamp(scratch.pool)).toEqual([NEXT]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'leaves nothing behind when a step fails part-way from empty',
    async () => {
      const scratch = await emptyDatabase();
      const failing = next({
        slug: 'raises',
        backfill: `DO $$ BEGIN RAISE EXCEPTION 'synthetic backfill failure'; END $$;`,
        fingerprint: NEXT,
      });

      const failure = await sqlRefusal(scratch.db.url, failing);
      expect(failure.message).toMatch(/synthetic backfill failure/);

      expect(await publicTables(scratch.pool)).toEqual([]);
      const jobs = await scratch.pool.query<{ present: boolean }>(
        'select exists (select 1 from pg_namespace where nspname = $1) as present',
        [JOB_SCHEMA],
      );
      expect(jobs.rows[0]?.present).toBe(false);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'leaves the previous release intact when an upgrade fails part-way',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);
      const before = await history(scratch.pool);

      const failure = await sqlRefusal(
        scratch.db.url,
        next({
          slug: 'raises',
          delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
          backfill: `DO $$ BEGIN RAISE EXCEPTION 'synthetic backfill failure'; END $$;`,
          fingerprint: NEXT,
        }),
      );
      expect(failure.message).toMatch(/synthetic backfill failure/);

      expect(await history(scratch.pool)).toEqual(before);
      expect(await stamp(scratch.pool)).toEqual([SCHEMA_FINGERPRINT]);
      const column = await scratch.pool.query(
        `select 1 from information_schema.columns
          where table_name = 'deployment_state' and column_name = 'probe'`,
      );
      expect(column.rowCount).toBe(0);
    },
    CASE_TIMEOUT_MS,
  );

  describe('refuses history this image is not a release of', () => {
    const second = {
      slug: 'second',
      delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
      fingerprint: NEXT,
    } satisfies SyntheticMigration;

    it(
      'a migration this image does not carry, as newer',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url, next(second));

        const failure = await refusal(scratch.db.url, committed);
        expect(failure).toBeInstanceOf(MigrationHistoryRefused);
        expect(failure).toMatchObject({ verdict: 'newer' });
        expect(failure.message).toMatch(/migrated by a newer Studio/);
        expect(failure.message).toMatch(/_second applied /);
        expect(failure.message).toMatch(
          /restore the backup taken before the upgrade/,
        );
        expect(await stamp(scratch.pool)).toEqual([NEXT]);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'a different migration at a recorded position, as reordered',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url, next(second));

        const failure = await refusal(
          scratch.db.url,
          next(
            { ...second, slug: 'other', fingerprint: NEXT },
            { ...second, delta: '', fingerprint: AFTER_NEXT },
          ),
        );
        expect(failure).toMatchObject({ verdict: 'reordered' });
        expect(failure.message).toMatch(/Deploy the released image/);
        expect(await stamp(scratch.pool)).toEqual([NEXT]);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'an applied migration whose artefact changed, as edited, naming it',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url, next(second));

        const failure = await refusal(
          scratch.db.url,
          next(
            {
              ...second,
              delta: `${second.delta}\n-- edited after release`,
            },
            { slug: 'third', fingerprint: AFTER_NEXT },
          ),
        );
        expect(failure).toMatchObject({ verdict: 'edited' });
        expect(failure.message).toMatch(/its delta\.sql differs/);
        expect(failure.message).toMatch(/Deploy the released image/);
        expect(await stamp(scratch.pool)).toEqual([NEXT]);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'a recorded release whose stamp was changed outside migrate, as inconsistent',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);
        await scratch.pool.query(
          `update "schemaFingerprint" set "fingerprint" = $1`,
          ['d'.repeat(64)],
        );

        const failure = await refusal(scratch.db.url);
        expect(failure).toMatchObject({ verdict: 'inconsistent' });
        expect(failure.message).toMatch(/Restore the backup/);
      },
      CASE_TIMEOUT_MS,
    );
  });

  it(
    'refuses a document another build rendered, before touching the database',
    async () => {
      const scratch = await emptyDatabase();
      const foreign = JSON.stringify({
        ...committed,
        fingerprint: 'e'.repeat(64),
      });

      const failure = await Effect.runPromise(
        Effect.flip(
          readVerifiedMigrations(foreign).pipe(
            Effect.flatMap((migrations) => migrateDatabaseEffect(migrations)),
            Effect.provide(ownerLayer(scratch.db.url)),
          ),
        ),
      );
      expect(failure).toBeInstanceOf(MigrationsDocumentRefused);
      expect(failure.message).toMatch(/rendered by a different build/);
      expect(await publicTables(scratch.pool)).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'leaves the history unreadable and unwritable by both application roles',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);

      for (const role of ['studio_app', 'studio_maintenance']) {
        const client = await scratch.pool.connect();
        try {
          await client.query(`set role ${role}`);
          for (const statement of [
            'select * from studio_migrations',
            `insert into studio_migrations values ('9999_x', 9999, 'h', '{}', now(), 'x')`,
            'delete from studio_migrations',
          ]) {
            await expect(
              client.query(statement),
              `${role}: ${statement}`,
            ).rejects.toMatchObject({ code: '42501' });
          }
        } finally {
          await client.query('reset role').catch(() => undefined);
          client.release();
        }
      }
    },
    CASE_TIMEOUT_MS,
  );

  describe('a backfill on a FORCEd tenant table, as a non-superuser owner', () => {
    const TEAM = 'migrate-backfill-team';

    async function withDrafts(scratch: OwnedScratchDatabase) {
      await run(scratch.db.url);
      // As the cluster superuser, which RLS does not bind, so the rows exist
      // whatever the policy says.
      await scratch.admin.query(
        `insert into teams (id, name, slug) values ($1, $1, $1)`,
        [TEAM],
      );
      for (let index = 0; index < 3; index += 1) {
        await scratch.admin.query(
          `insert into drafts (id, team_id, head_manifest_hash) values ($1, $2, 'h')`,
          [randomUUID(), TEAM],
        );
      }
    }

    const backfilled = async (scratch: OwnedScratchDatabase) =>
      (
        await scratch.admin.query<{ count: number }>(
          `select count(*)::int as count from drafts where probe = 'backfilled'`,
        )
      ).rows[0]?.count;

    it(
      'matches no row without the maintenance role, silently',
      async () => {
        const scratch = await emptyDatabase();
        await withDrafts(scratch);

        await run(
          scratch.db.url,
          next({
            slug: 'backfill_as_owner',
            delta: 'ALTER TABLE drafts ADD COLUMN probe text;',
            backfill: `UPDATE drafts SET probe = 'backfilled';`,
            fingerprint: NEXT,
          }),
        );
        // The trap the authoring guide names: no error, and no row.
        expect(await backfilled(scratch)).toBe(0);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'reaches every row under SET LOCAL ROLE studio_maintenance',
      async () => {
        const scratch = await emptyDatabase();
        await withDrafts(scratch);

        await run(
          scratch.db.url,
          next({
            slug: 'backfill_as_maintenance',
            delta: 'ALTER TABLE drafts ADD COLUMN probe text;',
            backfill: [
              'SET LOCAL ROLE studio_maintenance;',
              `UPDATE drafts SET probe = 'backfilled';`,
              'RESET ROLE;',
            ].join('\n'),
            fingerprint: NEXT,
          }),
        );
        expect(await backfilled(scratch)).toBe(3);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'refuses a backfill that leaves the role switched',
      async () => {
        const scratch = await emptyDatabase();
        await withDrafts(scratch);

        const failure = await refusal(
          scratch.db.url,
          next({
            slug: 'backfill_no_reset',
            delta: 'ALTER TABLE drafts ADD COLUMN probe text;',
            backfill: [
              'SET LOCAL ROLE studio_maintenance;',
              `UPDATE drafts SET probe = 'backfilled';`,
            ].join('\n'),
            fingerprint: NEXT,
          }),
        );
        expect(failure).toMatchObject({ verdict: 'role' });
        expect(failure.message).toMatch(/backfill\.sql left the session/);
        // Rolled back with the rest of the run: not even the delta stayed.
        const column = await scratch.admin.query(
          `select 1 from information_schema.columns
            where table_name = 'drafts' and column_name = 'probe'`,
        );
        expect(column.rowCount).toBe(0);
      },
      CASE_TIMEOUT_MS,
    );

    // #1901 E-2: the backfill runs after the sidecars, so a table the same
    // migration creates already carries its grants when the backfill fills it.
    it(
      'fills a table the same migration creates, from every row of an existing one',
      async () => {
        const scratch = await emptyDatabase();
        await withDrafts(scratch);
        const sidecars = committed.migrations
          .at(-1)
          ?.artefacts.find(({ name }) => name === 'sidecars.sql')?.sql;
        expect(sidecars).toBeDefined();

        await run(
          scratch.db.url,
          next({
            slug: 'draft_labels',
            delta: [
              'CREATE TABLE "draft_labels" ("draft_id" uuid PRIMARY KEY, "team_id" text NOT NULL, "label" text NOT NULL);',
              'ALTER TABLE "draft_labels" ENABLE ROW LEVEL SECURITY;',
              `CREATE POLICY "team_isolation" ON "draft_labels" AS PERMISSIVE FOR ALL TO public USING (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance') WITH CHECK (team_id = NULLIF(current_setting('app.team_id', true), '') OR current_user = 'studio_maintenance');`,
            ].join('\n'),
            sidecars: `${sidecars}\nALTER TABLE draft_labels FORCE ROW LEVEL SECURITY;\n`,
            backfill: [
              'SET LOCAL ROLE studio_maintenance;',
              `INSERT INTO draft_labels (draft_id, team_id, label) SELECT id, team_id, 'copied' FROM drafts;`,
              'RESET ROLE;',
            ].join('\n'),
            fingerprint: NEXT,
          }),
        );
        const copied = await scratch.admin.query<{ count: number }>(
          `select count(*)::int as count from draft_labels where label = 'copied'`,
        );
        expect(copied.rows[0]?.count).toBe(3);
      },
      CASE_TIMEOUT_MS,
    );
  });

  describe('what one file leaves for the next', () => {
    it(
      'refuses, at the next check, a session whose transaction an artefact ended',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        const outcome = await Effect.runPromise(
          OwnerScope.open(
            Effect.gen(function* () {
              const { sql } = yield* Transaction;
              const baseline = yield* readSessionState(sql);
              // The positive control: an untouched session passes.
              yield* assertSessionState(sql, baseline, 'control');
              yield* sql.unsafe('COMMIT');
              return yield* Effect.flip(
                assertSessionState(sql, baseline, '0002_x/backfill.sql'),
              );
            }),
          ).pipe(Effect.provide(ownerLayer(scratch.db.url))),
        );
        expect(outcome).toBeInstanceOf(MigrationHistoryRefused);
        expect(outcome).toMatchObject({ verdict: 'transaction' });
        expect(outcome.message).toMatch(
          /^0002_x\/backfill\.sql ended the migration's transaction/,
        );
        expect(outcome.message).toMatch(/Restore the backup/);
      },
      CASE_TIMEOUT_MS,
    );

    it.each([
      [
        'search_path changed',
        `SELECT set_config('search_path', '${JOB_SCHEMA}, public', true);`,
        /left search_path set to "studio_jobs, public" rather than /,
      ],
      [
        'the team setting set',
        `SELECT set_config('app.team_id', 'some-team', true);`,
        /left app\.team_id set to "some-team" rather than ""/,
      ],
      [
        'a guard trigger disabled',
        'ALTER TABLE studies DISABLE TRIGGER studies_closed_read_only;',
        /changed triggers: studies_closed_read_only on public\.studies enabled → disabled\. .*ENABLE a guard trigger it disabled/,
      ],
      // #1901 FX-3: every change to a trigger, not only a disabled one.
      [
        'a guard trigger firing only under replication',
        'ALTER TABLE studies ENABLE REPLICA TRIGGER studies_closed_read_only;',
        /changed triggers: studies_closed_read_only on public\.studies enabled → enabled replica\./,
      ],
      [
        'a guard trigger switched to ALWAYS',
        'ALTER TABLE studies ENABLE ALWAYS TRIGGER studies_closed_read_only;',
        /changed triggers: studies_closed_read_only on public\.studies enabled → enabled always\./,
      ],
      [
        'a guard trigger dropped',
        'DROP TRIGGER studies_closed_read_only ON studies;',
        /changed triggers: studies_closed_read_only on public\.studies dropped\. .*create, drop or change a trigger in delta\.sql/,
      ],
      [
        'a trigger it created',
        'CREATE TRIGGER probe_guard BEFORE UPDATE ON deployment_state FOR EACH ROW EXECUTE FUNCTION audit_events_are_immutable();',
        /changed triggers: probe_guard on public\.deployment_state created \(enabled\)\./,
      ],
      [
        'FORCE ROW LEVEL SECURITY lifted',
        'ALTER TABLE drafts NO FORCE ROW LEVEL SECURITY;',
        /changed row-level security: public\.drafts enabled and forced → enabled, not forced\. .*must FORCE it again/,
      ],
      [
        'the erasure marker set',
        `SELECT set_config('app.erasing_participant_id', 'someone', true);`,
        /left app\.erasing_participant_id set to "someone" rather than ""/,
      ],
    ])(
      'refuses a backfill that leaves %s, and rolls everything back',
      async (_name, backfill, message) => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        const failure = await refusal(
          scratch.db.url,
          next({
            slug: 'leaks',
            delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
            backfill,
            fingerprint: NEXT,
          }),
        );
        expect(failure).toMatchObject({ verdict: 'session' });
        expect(failure.message).toMatch(/_leaks\/backfill\.sql /);
        expect(failure.message).toMatch(message);
        const column = await scratch.pool.query(
          `select 1 from information_schema.columns
            where table_name = 'deployment_state' and column_name = 'probe'`,
        );
        expect(column.rowCount).toBe(0);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'refuses a delta that leaves a trigger firing only under replication',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        const failure = await refusal(
          scratch.db.url,
          next({
            slug: 'replica',
            delta:
              'ALTER TABLE studies ENABLE REPLICA TRIGGER studies_closed_read_only;',
            fingerprint: NEXT,
          }),
        );
        expect(failure).toMatchObject({ verdict: 'session' });
        expect(failure.message).toMatch(
          /_replica\/delta\.sql left triggers that no longer fire as they did: studies_closed_read_only on public\.studies enabled → enabled replica\./,
        );
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'admits a delta that drops a trigger, which a schema change may do',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        await run(
          scratch.db.url,
          next({
            slug: 'drops_guard',
            delta: 'DROP TRIGGER studies_closed_read_only ON studies;',
            // A sidecar that no longer installs it, so the drop stands.
            sidecars: committedSidecars().replace(
              /CREATE OR REPLACE TRIGGER studies_closed_read_only[\s\S]*?;\n/,
              '',
            ),
            fingerprint: NEXT,
          }),
        );
        const guard = await scratch.pool.query(
          `select 1 from pg_trigger where tgname = 'studies_closed_read_only'`,
        );
        expect(guard.rowCount).toBe(0);
      },
      CASE_TIMEOUT_MS,
    );

    // #1901 E-3: each file's deferred checks fire at its end, and the
    // constraints declared INITIALLY DEFERRED are deferred again after, so a
    // later file can still write a row before the partner it points at.
    it(
      'leaves an INITIALLY DEFERRED constraint deferred for the files after the first',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        await run(
          scratch.db.url,
          next({
            slug: 'pairs',
            delta:
              'CREATE TABLE probe_pairs (id int PRIMARY KEY, partner int NOT NULL REFERENCES probe_pairs (id) DEFERRABLE INITIALLY DEFERRED);',
            backfill: [
              'INSERT INTO probe_pairs VALUES (1, 2);',
              'INSERT INTO probe_pairs VALUES (2, 1);',
            ].join('\n'),
            fingerprint: NEXT,
          }),
        );
        const pairs = await scratch.pool.query(
          'select id, partner from probe_pairs order by id',
        );
        expect(pairs.rows).toEqual([
          { id: 1, partner: 2 },
          { id: 2, partner: 1 },
        ]);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'fails a file whose deferred check fails at the file, naming it',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        const failure = await refusal(
          scratch.db.url,
          next({
            slug: 'orphan',
            delta:
              'CREATE TABLE probe_pairs (id int PRIMARY KEY, partner int NOT NULL REFERENCES probe_pairs (id) DEFERRABLE INITIALLY DEFERRED);',
            backfill: 'INSERT INTO probe_pairs VALUES (1, 2);',
            fingerprint: NEXT,
          }),
        );
        expect(failure).toMatchObject({
          _tag: 'MigrationStatementFailed',
          artefact: 'backfill.sql',
          position: 'at the end of the file',
          code: '23503',
          rolledBack: true,
        });
        expect(await publicTables(scratch.pool)).not.toContain('probe_pairs');
      },
      CASE_TIMEOUT_MS,
    );

    // #1901 FX-4: a run's settling must not change how a later file's own
    // INITIALLY DEFERRED constraint behaves. The same three statements apply
    // as the first file of a run (an upgrade's delta), as a later file of an
    // upgrade (its backfill), and as a later file of a fresh install.
    const PAIRS = [
      'CREATE TABLE probe_pairs (id int PRIMARY KEY, partner int NOT NULL REFERENCES probe_pairs (id) DEFERRABLE INITIALLY DEFERRED);',
      'INSERT INTO probe_pairs VALUES (1, 2);',
      'INSERT INTO probe_pairs VALUES (2, 1);',
    ].join('\n');

    it.each([
      ['the first file of an upgrade', { delta: PAIRS }, true],
      ['a later file of an upgrade', { backfill: PAIRS }, true],
      ['a later file of a fresh install', { delta: PAIRS }, false],
    ])(
      'keeps a file’s own INITIALLY DEFERRED constraint deferred as %s',
      async (_name, files, upgrade) => {
        const scratch = await emptyDatabase();
        if (upgrade) await run(scratch.db.url);

        const outcome = await run(
          scratch.db.url,
          next({ slug: 'own_pairs', ...files, fingerprint: NEXT }),
        );
        expect(outcome.kind).toBe('applied');
        const pairs = await scratch.pool.query(
          'select id, partner from probe_pairs order by id',
        );
        expect(pairs.rows).toEqual([
          { id: 1, partner: 2 },
          { id: 2, partner: 1 },
        ]);
      },
      CASE_TIMEOUT_MS,
    );

    it(
      'refuses, by name, a deferred constraint whose name a non-deferrable one shares',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        const failure = await refusal(
          scratch.db.url,
          next({
            slug: 'shared_name',
            delta: [
              'CREATE TABLE probe_pairs (id int PRIMARY KEY, partner int NOT NULL, CONSTRAINT probe_pair_partner FOREIGN KEY (partner) REFERENCES probe_pairs (id) DEFERRABLE INITIALLY DEFERRED);',
              'CREATE TABLE probe_other (id int, CONSTRAINT probe_pair_partner CHECK (id > 0));',
            ].join('\n'),
            fingerprint: NEXT,
          }),
        );
        expect(failure).toBeInstanceOf(MigrationHistoryRefused);
        expect(failure).toMatchObject({ verdict: 'constraint' });
        expect(failure.message).toMatch(
          /_shared_name\/delta\.sql, the INITIALLY DEFERRED constraint public\.probe_pair_partner shares its name .* Rename one of them\./,
        );
        expect(await publicTables(scratch.pool)).not.toContain('probe_pairs');
      },
      CASE_TIMEOUT_MS,
    );

    // #1901 FX-5: the deferred checks fire before the session checks, so they
    // run under what the file left — here a team setting it never reset — and
    // the report names the check rather than the setting.
    it(
      'fires a file’s deferred checks under the settings it ended on, before the session checks',
      async () => {
        const scratch = await emptyDatabase();
        await run(scratch.db.url);

        const failure = await refusal(
          scratch.db.url,
          next({
            slug: 'team_check',
            delta: [
              'CREATE TABLE probe_rows (id int PRIMARY KEY);',
              `CREATE FUNCTION probe_rows_team() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'fired under team %', current_setting('app.team_id', true); END; $$ LANGUAGE plpgsql;`,
              'CREATE CONSTRAINT TRIGGER probe_rows_team AFTER INSERT ON probe_rows DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION probe_rows_team();',
            ].join('\n'),
            backfill: [
              `SELECT set_config('app.team_id', 'probe-team', true);`,
              'INSERT INTO probe_rows VALUES (1);',
            ].join('\n'),
            fingerprint: NEXT,
          }),
        );
        expect(failure).toMatchObject({
          _tag: 'MigrationStatementFailed',
          artefact: 'backfill.sql',
          position: 'at the end of the file',
          reason: 'fired under team probe-team',
        });
      },
      CASE_TIMEOUT_MS,
    );
  });

  // #1901 FX-7: a `--` comment ends at a carriage return, so the statement
  // after it is a statement of its own, counted and named.
  it(
    'names the statement after a comment a carriage return ends',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);

      const failure = await refusal(
        scratch.db.url,
        next({
          slug: 'carriage_return',
          backfill:
            '-- fill it\rUPDATE studies SET no_such_column = 1;\nSELECT 1;',
          fingerprint: NEXT,
        }),
      );
      expect(failure).toMatchObject({
        _tag: 'MigrationStatementFailed',
        artefact: 'backfill.sql',
        position: 'statement 1 of 2',
        statement: 'UPDATE studies SET no_such_column = 1',
        code: '42703',
      });
    },
    CASE_TIMEOUT_MS,
  );

  // #1901 FX-8: a run whose COMMIT fails applied nothing, so it never says
  // it did, and says that it did not. The delta queues a deferred check on the history row the run
  // records last, which only COMMIT fires.
  it(
    'says “Applied” only once COMMIT has returned, and “Nothing was applied” when it is refused',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);
      const before = await history(scratch.pool);

      const lines: string[] = [];
      const failure = await Effect.runPromise(
        refusalOf(
          migrateDatabaseEffect(
            verifyMigrations(
              next({
                slug: 'fails_at_commit',
                delta: [
                  `CREATE FUNCTION probe_refuse_commit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'refused at commit'; END; $$ LANGUAGE plpgsql;`,
                  'CREATE CONSTRAINT TRIGGER probe_refuse_commit AFTER INSERT ON studio_migrations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION probe_refuse_commit();',
                ].join('\n'),
                fingerprint: NEXT,
              }),
              NEXT,
            ),
            { log: (line) => lines.push(line) },
          ).pipe(Effect.provide(ownerLayer(scratch.db.url))),
        ),
      );
      // A refusal Postgres reported at COMMIT rolled everything back, and
      // the operator is told so.
      expect(failure.state).toBe('P0001');
      expect(failure.message.split('\n')).toEqual([
        "The migration's COMMIT failed (P0001): refused at commit",
        'Nothing was applied: the transaction rolled back, and the database is as it was before migrate ran.',
      ]);
      // The run got as far as the commit.
      expect(lines).toEqual([
        expect.stringMatching(/^Applying \d{4}_fails_at_commit /),
      ]);
      expect(await history(scratch.pool)).toEqual(before);
      expect(await stamp(scratch.pool)).toEqual([SCHEMA_FINGERPRINT]);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'leaves a job queued before a studio_jobs migration, and it is worked after',
    async () => {
      const scratch = await emptyDatabase();
      await run(scratch.db.url);

      const jobId = await enqueueAsApplication(
        scratch.db,
        'denied-attempts-summary',
        {},
      );

      await run(
        scratch.db.url,
        next({
          slug: 'jobs_probe',
          delta: `ALTER TABLE ${JOB_SCHEMA}.jobs ADD COLUMN probe text;`,
          fingerprint: NEXT,
        }),
      );

      const queued = await scratch.pool.query<{ state: string }>(
        `select state from ${JOB_SCHEMA}.jobs where id = $1`,
        [jobId],
      );
      expect(queued.rows).toEqual([{ state: 'created' }]);

      const handled: string[] = [];
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const worker = yield* JobWorker;
            yield* worker.work('denied-attempts-summary', (job) =>
              Effect.sync(() => {
                handled.push(job.id);
                return 'completed' as const;
              }),
            );
            yield* worker.drainOnce('denied-attempts-summary');
          }),
        ).pipe(
          Effect.provide(
            JobWorker.layer({ schema: JOB_SCHEMA, background: false }).pipe(
              Layer.provideMerge(Jobs.layer({ schema: JOB_SCHEMA })),
              Layer.provideMerge(
                Layer.orDie(
                  MaintenanceDatabase.layer({
                    url: scratch.db.url,
                    maxConnections: 2,
                  }),
                ),
              ),
              Layer.provide(JobClock.layerTest),
            ),
          ),
        ),
      );

      expect(handled).toEqual([jobId]);
      const settled = await scratch.pool.query<{ state: string }>(
        `select state from ${JOB_SCHEMA}.jobs where id = $1`,
        [jobId],
      );
      expect(settled.rows).toEqual([{ state: 'completed' }]);
    },
    CASE_TIMEOUT_MS,
  );
});
