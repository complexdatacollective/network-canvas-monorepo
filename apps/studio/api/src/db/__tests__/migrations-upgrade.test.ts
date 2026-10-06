import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generateDrizzleJson,
  generateMigration,
} from 'drizzle-kit/api-postgres';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { teamIsolationPolicy } from '@codaco/studio-sync/rls';

import { schemaFingerprintOf, seedDatabase } from '../../../scripts/apply.ts';
import { generateMigrationDirectory } from '../../../scripts/migrate-generate.ts';
import {
  MIGRATIONS_DIR,
  readMigrationsDocument,
} from '../../../scripts/render-migrations.ts';
import {
  committedDocument,
  createOwnedScratchDatabase,
  type OwnedScratchDatabase,
  withMigrations,
} from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { testKeyring } from '../../__tests__/support/secrets.ts';
import { renderJobStatements } from '../../jobs/queues.ts';
import { OwnerDatabase } from '../client.ts';
import { migrateDatabaseEffect } from '../migrate.ts';
import {
  type MigrationsDocument,
  verifyMigrations,
} from '../migrations-document.ts';
import { SCHEMA, SIDECARS } from '../schema.ts';

// An upgrade of a database that has rows (#1901 E-4). Every other suite of the
// migrations builds from empty, where a NOT NULL column with no default, a
// backfill that cannot see its table, or a deferred check that only fires on
// data all pass. This one migrates to the committed release, fills it with the
// demo seed — every team, study, session, snapshot, consent and audit row the
// development instance runs on — and upgrades it with a migration the real
// generator wrote. The cases share the one seeded database and run in order,
// each upgrading the release the one before it left.

const db = await reachableDb();

const SEEDING_TIMEOUT_MS = 360_000;
const CASE_TIMEOUT_MS = 180_000;

/** A table the next release adds, filled from `studies` by its backfill. */
const studyLabels = pgTable(
  'study_labels',
  {
    studyId: uuid('study_id').primaryKey(),
    teamId: text('team_id').notNull(),
    label: text('label').notNull(),
  },
  () => [teamIsolationPolicy()],
);

const NEXT_SIDECARS = [
  ...SIDECARS,
  'ALTER TABLE study_labels FORCE ROW LEVEL SECURITY;',
];

/**
 * The authoring guide's NOT NULL recipe on `studies`, whose closed rows a
 * trigger keeps read-only to every role: the backfill lifts that one trigger
 * around its own write, inside the transaction, as the owner.
 */
const CODE_BACKFILL = [
  'ALTER TABLE studies DISABLE TRIGGER studies_closed_read_only;',
  'SET LOCAL ROLE studio_maintenance;',
  'UPDATE studies SET code = left(id::text, 8);',
  'RESET ROLE;',
  'ALTER TABLE studies ENABLE TRIGGER studies_closed_read_only;',
  'ALTER TABLE studies ALTER COLUMN code SET NOT NULL;',
].join('\n');

const CODE_DELTA = 'ALTER TABLE "studies" ADD COLUMN "code" text;';

const AFTER_NEXT = 'c'.repeat(64);
const LATER = 'd'.repeat(64);

describe.skipIf(!db)('an upgrade of a populated database', () => {
  let scratch: OwnedScratchDatabase;
  let generated: MigrationsDocument;
  const dirs: string[] = [];

  const migrate = (document: MigrationsDocument) =>
    Effect.runPromise(
      migrateDatabaseEffect(
        verifyMigrations(document, document.fingerprint),
      ).pipe(Effect.provide(OwnerDatabase.layer(scratch.db))),
    );

  const failure = (document: MigrationsDocument) =>
    Effect.runPromise(
      Effect.flip(
        migrateDatabaseEffect(
          verifyMigrations(document, document.fingerprint),
        ).pipe(Effect.provide(OwnerDatabase.layer(scratch.db))),
      ),
    );

  const count = async (statement: string) =>
    (await scratch.admin.query<{ count: number }>(statement)).rows[0]?.count;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createOwnedScratchDatabase(db);
    const committed = committedDocument();
    await migrate(committed);

    // The seed is a development tool that wipes every populated table first,
    // the migration history among them, so the history is put back after it.
    const recorded = await scratch.admin.query(
      'select * from studio_migrations order by ordinal',
    );
    await seedDatabase(scratch.db, { secrets: testKeyring() });
    await scratch.admin.query('truncate studio_migrations');
    for (const row of recorded.rows) {
      const columns = Object.keys(row);
      await scratch.admin.query(
        `insert into studio_migrations (${columns.map((name) => `"${name}"`).join(', ')})
         values (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
        Object.values(row),
      );
    }

    // The next release, written by the generator itself.
    const root = mkdtempSync(join(tmpdir(), 'studio-upgrade-'));
    dirs.push(root);
    const dir = join(root, 'migrations');
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    const schema = { ...SCHEMA, studyLabels };
    const jobStatements = renderJobStatements();
    const fingerprint = schemaFingerprintOf(
      await generateMigration(
        await generateDrizzleJson({}),
        await generateDrizzleJson(schema),
      ),
      NEXT_SIDECARS,
      jobStatements,
    );
    const inputs = {
      schema,
      sidecars: NEXT_SIDECARS,
      jobStatements,
      committedFingerprint: fingerprint,
      dir,
      isReleased: () => false,
    };
    const written = await generateMigrationDirectory(inputs, {
      kind: 'generate',
      name: 'study_labels',
    });
    expect(written).toMatchObject({ kind: 'written', handWritten: false });
    const version = written.kind === 'written' ? written.version : '';
    // The authoring guide's recipe, unchanged, for both kinds of table: one
    // the delta just created and one the previous release already filled.
    writeFileSync(
      join(dir, version, 'backfill.sql'),
      [
        'SET LOCAL ROLE studio_maintenance;',
        `INSERT INTO study_labels (study_id, team_id, label) SELECT id, team_id, name FROM studies;`,
        `UPDATE drafts SET head_seq = head_seq;`,
        'RESET ROLE;',
        '',
      ].join('\n'),
    );
    await generateMigrationDirectory(inputs, { kind: 'seal' });
    generated = readMigrationsDocument(dir, fingerprint);
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    await scratch?.dispose().catch(() => undefined);
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }, 120_000);

  it(
    'starts from a database the seed filled',
    async () => {
      for (const table of [
        'studies',
        'drafts',
        'interview_sessions',
        'session_snapshots',
        'participant_consents',
        'audit_events',
        'webhook_subscriptions',
      ]) {
        expect(
          await count(`select count(*)::int as count from ${table}`),
          table,
        ).toBeGreaterThan(0);
      }
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'applies a generated migration whose backfill fills a new table and an existing one',
    async () => {
      const studies = await count('select count(*)::int as count from studies');
      const drafts = await count('select count(*)::int as count from drafts');

      expect(await migrate(generated)).toEqual({
        kind: 'applied',
        versions: [generated.migrations.at(-1)?.version],
      });
      expect(
        await count(
          'select count(*)::int as count from study_labels l join studies s on s.id = l.study_id and s.name = l.label',
        ),
      ).toBe(studies);
      // Every draft row was rewritten in this transaction: the maintenance
      // role reached them all through FORCE ROW LEVEL SECURITY.
      expect(
        await count(
          `select count(*)::int as count from drafts
            where xmin::text::bigint = (select max(xmin::text::bigint) from drafts)`,
        ),
      ).toBe(drafts);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'fails a NOT NULL column with no default on a table with rows, and rolls back',
    async () => {
      const refused = await failure(
        withMigrations(generated, {
          slug: 'naive_code',
          delta: 'ALTER TABLE "studies" ADD COLUMN "code" text NOT NULL;',
          fingerprint: AFTER_NEXT,
        }),
      );
      expect(refused).toMatchObject({
        _tag: 'MigrationStatementFailed',
        artefact: 'delta.sql',
        code: '23502',
        rolledBack: true,
      });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'applies the same column by the authoring guide’s recipe',
    async () => {
      await migrate(
        withMigrations(generated, {
          slug: 'code',
          delta: CODE_DELTA,
          backfill: CODE_BACKFILL,
          fingerprint: AFTER_NEXT,
        }),
      );
      const column = await scratch.admin.query<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns
          where table_name = 'studies' and column_name = 'code'`,
      );
      expect(column.rows).toEqual([{ is_nullable: 'NO' }]);
      expect(
        await count(
          `select count(*)::int as count from studies where code is distinct from left(id::text, 8)`,
        ),
      ).toBe(0);
      // The closed studies were filled too, and their guard is back.
      expect(
        await count(
          `select count(*)::int as count from studies where state = 'closed'`,
        ),
      ).toBeGreaterThan(0);
      const guard = await scratch.admin.query<{ enabled: string }>(
        `select tgenabled as enabled from pg_trigger where tgname = 'studies_closed_read_only'`,
      );
      expect(guard.rows).toEqual([{ enabled: 'O' }]);
    },
    CASE_TIMEOUT_MS,
  );

  // #1901 E-3: a backfill that finalizes a session queues the deferred check
  // that it carries its snapshot, and the next migration's sidecars ALTER that
  // table, which Postgres refuses while the event is pending.
  it(
    'settles a backfill’s deferred checks before the next migration alters the table',
    async () => {
      const finalizable = `
        select s.id from interview_sessions s
          join studies st on st.id = s.study_id and st.team_id = s.team_id
         where s.status = 'in_progress' and st.state <> 'closed'
         order by s.id limit 1`;
      const [session] = (await scratch.admin.query<{ id: string }>(finalizable))
        .rows;
      expect(session).toBeDefined();

      const outcome = await migrate(
        withMigrations(
          generated,
          {
            slug: 'code',
            delta: CODE_DELTA,
            backfill: CODE_BACKFILL,
            fingerprint: AFTER_NEXT,
          },
          {
            slug: 'finalize_one',
            backfill: [
              'SET LOCAL ROLE studio_maintenance;',
              `UPDATE interview_sessions SET status = 'completed', completed_at = now() WHERE id = '${session?.id}';`,
              `INSERT INTO session_snapshots (session_id, team_id, study_id, protocol_version_id, schema_version, payload, payload_hash)
                 SELECT s.id, s.team_id, s.study_id, s.protocol_version_id, v.schema_version, '{}', 'upgrade-probe'
                   FROM interview_sessions s
                   JOIN protocol_versions v ON v.id = s.protocol_version_id AND v.team_id = s.team_id
                  WHERE s.id = '${session?.id}';`,
              'RESET ROLE;',
            ].join('\n'),
            fingerprint: LATER,
          },
          { slug: 'after_finalize', fingerprint: 'e'.repeat(64) },
        ),
      );
      expect(outcome).toMatchObject({ kind: 'applied' });
      expect(outcome.kind === 'applied' ? outcome.versions : []).toHaveLength(
        2,
      );
      const finalized = await scratch.admin.query<{ status: string }>(
        `select s.status from interview_sessions s
           join session_snapshots n on n.session_id = s.id
          where s.id = $1 and n.payload_hash = 'upgrade-probe'`,
        [session?.id],
      );
      expect(finalized.rows).toEqual([{ status: 'completed' }]);
    },
    CASE_TIMEOUT_MS,
  );
});
