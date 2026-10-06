import { randomUUID } from 'node:crypto';
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
  type SyntheticMigration,
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

/** A distinct stand-in fingerprint for each synthetic release after those. */
const releaseFingerprint = (n: number) => n.toString(16).padStart(64, 'f');

/**
 * The authoring guide's route for `audit_events`, the one tenant table whose
 * policy admits no maintenance role: as the owner, lift FORCE ROW LEVEL
 * SECURITY (and the immutability guard) around the write, and restore both.
 */
const AUDIT_BACKFILL = [
  'ALTER TABLE audit_events NO FORCE ROW LEVEL SECURITY;',
  'ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable;',
  'UPDATE audit_events SET probe_category = category;',
  'ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable;',
  'ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;',
  'ALTER TABLE audit_events ALTER COLUMN probe_category SET NOT NULL;',
].join('\n');

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

  /** Every synthetic release a case has applied, in order, for the next. */
  const released: SyntheticMigration[] = [];

  const after = (migration: SyntheticMigration) =>
    withMigrations(generated, ...released, migration);

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
      const code = {
        slug: 'code',
        delta: CODE_DELTA,
        backfill: CODE_BACKFILL,
        fingerprint: AFTER_NEXT,
      };
      await migrate(withMigrations(generated, code));
      released.push(code);
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

      const finalize = [
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
      ];
      const outcome = await migrate(
        withMigrations(generated, ...released, ...finalize),
      );
      expect(outcome).toMatchObject({ kind: 'applied' });
      expect(outcome.kind === 'applied' ? outcome.versions : []).toHaveLength(
        2,
      );
      released.push(...finalize);
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
  // #1901 FX-2: the guarded-row recipe's maintenance role cannot write audit
  // events — the sidecars revoke its UPDATE, and their policy admits only a
  // matching team — which is why the guide gives them a route of their own.
  it(
    'refuses the maintenance role an update of audit events',
    async () => {
      const refused = await failure(
        after({
          slug: 'audit_as_maintenance',
          delta: 'ALTER TABLE audit_events ADD COLUMN probe_category text;',
          backfill: [
            'ALTER TABLE audit_events DISABLE TRIGGER audit_events_immutable;',
            'SET LOCAL ROLE studio_maintenance;',
            'UPDATE audit_events SET probe_category = category;',
            'RESET ROLE;',
            'ALTER TABLE audit_events ENABLE TRIGGER audit_events_immutable;',
          ].join('\n'),
          fingerprint: releaseFingerprint(1),
        }),
      );
      expect(refused).toMatchObject({
        _tag: 'MigrationStatementFailed',
        artefact: 'backfill.sql',
        position: 'statement 3 of 5',
        code: '42501',
        rolledBack: true,
      });
    },
    CASE_TIMEOUT_MS,
  );

  it(
    'fills a new audit_events column on every event by the guide’s owner route',
    async () => {
      const events = await count(
        'select count(*)::int as count from audit_events',
      );
      expect(events).toBeGreaterThan(0);

      const audit = {
        slug: 'audit_category',
        delta: 'ALTER TABLE audit_events ADD COLUMN probe_category text;',
        backfill: AUDIT_BACKFILL,
        fingerprint: releaseFingerprint(2),
      };
      expect(await migrate(after(audit))).toMatchObject({ kind: 'applied' });
      released.push(audit);

      expect(
        await count(
          'select count(*)::int as count from audit_events where probe_category = category',
        ),
      ).toBe(events);
      const restored = await scratch.admin.query<{
        forced: boolean;
        guard: string;
        nullable: string;
      }>(
        `select c.relforcerowsecurity as forced,
                (select tgenabled from pg_trigger where tgname = 'audit_events_immutable')::text as guard,
                (select is_nullable from information_schema.columns
                  where table_name = 'audit_events' and column_name = 'probe_category') as nullable
           from pg_class c where c.oid = 'public.audit_events'::regclass`,
      );
      expect(restored.rows).toEqual([
        { forced: true, guard: 'O', nullable: 'NO' },
      ]);
    },
    CASE_TIMEOUT_MS,
  );

  // #1901 FX-5: re-enabling a trigger on a table with pending trigger events
  // fails (55006), so the guide settles the deferred check a status change
  // queued before it enables the guard again.
  it(
    'changes a session’s status with its guard lifted, settling the check before ENABLE TRIGGER',
    async () => {
      const [session] = (
        await scratch.admin.query<{ id: string }>(
          `select s.id from interview_sessions s
             join studies st on st.id = s.study_id and st.team_id = s.team_id
            where s.status = 'in_progress' and st.state <> 'closed'
            order by s.id limit 1`,
        )
      ).rows;
      expect(session).toBeDefined();
      const sessions = await count(
        'select count(*)::int as count from interview_sessions',
      );

      const statusChange = {
        slug: 'session_note',
        delta: 'ALTER TABLE interview_sessions ADD COLUMN probe_note text;',
        backfill: [
          'ALTER TABLE interview_sessions DISABLE TRIGGER interview_sessions_writable;',
          'SET LOCAL ROLE studio_maintenance;',
          'UPDATE interview_sessions SET probe_note = status;',
          `UPDATE interview_sessions SET status = 'completed', completed_at = now() WHERE id = '${session?.id}';`,
          `INSERT INTO session_snapshots (session_id, team_id, study_id, protocol_version_id, schema_version, payload, payload_hash)
             SELECT s.id, s.team_id, s.study_id, s.protocol_version_id, v.schema_version, '{}', 'upgrade-note-probe'
               FROM interview_sessions s
               JOIN protocol_versions v ON v.id = s.protocol_version_id AND v.team_id = s.team_id
              WHERE s.id = '${session?.id}';`,
          'SET CONSTRAINTS interview_sessions_completion_snapshot IMMEDIATE;',
          'RESET ROLE;',
          'ALTER TABLE interview_sessions ENABLE TRIGGER interview_sessions_writable;',
        ].join('\n'),
        fingerprint: releaseFingerprint(3),
      };
      expect(await migrate(after(statusChange))).toMatchObject({
        kind: 'applied',
      });
      released.push(statusChange);

      expect(
        await count(
          'select count(*)::int as count from interview_sessions where probe_note is not null',
        ),
      ).toBe(sessions);
      const finalized = await scratch.admin.query<{ status: string }>(
        `select s.status from interview_sessions s
           join session_snapshots n on n.session_id = s.id
          where s.id = $1 and n.payload_hash = 'upgrade-note-probe'`,
        [session?.id],
      );
      expect(finalized.rows).toEqual([{ status: 'completed' }]);
      const guard = await scratch.admin.query<{ enabled: string }>(
        `select tgenabled::text as enabled from pg_trigger where tgname = 'interview_sessions_writable'`,
      );
      expect(guard.rows).toEqual([{ enabled: 'O' }]);
    },
    CASE_TIMEOUT_MS,
  );

  /** A published document with a required item, in a study that enrols. */
  const consentTarget = async () => {
    const [target] = (
      await scratch.admin.query<{
        document: string;
        team: string;
        study: string;
        hash: string;
      }>(
        `select d.id as document, d.team_id as team, d.study_id as study, d.content_hash as hash
           from consent_documents d
           join studies st on st.id = d.study_id and st.team_id = d.team_id
          where d.state = 'published' and st.state <> 'closed'
            and exists (select 1 from consent_items i where i.consent_document_id = d.id and i.required)
            and exists (select 1 from participants p where p.study_id = d.study_id)
          order by d.id limit 1`,
      )
    ).rows;
    expect(target).toBeDefined();
    if (target === undefined) throw new Error('no consent document to grant');
    const participant = randomUUID();
    const consent = randomUUID();
    return {
      consent,
      participant: `INSERT INTO participants (id, study_id, team_id, participant_code)
         VALUES ('${participant}', '${target.study}', '${target.team}', 'upgrade-${participant.slice(0, 8)}');`,
      grant: `INSERT INTO participant_consents (id, team_id, study_id, participant_id, consent_document_id, consent_content_hash, granted_at)
         VALUES ('${consent}', '${target.team}', '${target.study}', '${participant}', '${target.document}', '${target.hash}', now());`,
      answers: `INSERT INTO participant_consent_item_responses (team_id, participant_consent_id, consent_document_id, consent_item_id, item_key, affirmed)
         SELECT team_id, '${consent}', consent_document_id, id, key, true
           FROM consent_items WHERE consent_document_id = '${target.document}';`,
      team: target.team,
    };
  };

  it(
    'inserts a consent and its answers as the maintenance role, its deferred check settled at the file’s end',
    async () => {
      const target = await consentTarget();
      const grant = {
        slug: 'consent_grant',
        backfill: [
          'SET LOCAL ROLE studio_maintenance;',
          target.participant,
          target.grant,
          target.answers,
          'RESET ROLE;',
        ].join('\n'),
        fingerprint: releaseFingerprint(4),
      };
      expect(await migrate(after(grant))).toMatchObject({ kind: 'applied' });
      released.push(grant);
      expect(
        await count(
          `select count(*)::int as count from participant_consent_item_responses where participant_consent_id = '${target.consent}'`,
        ),
      ).toBeGreaterThan(0);

      // The check is real under that role: a grant without its answers fails.
      const unanswered = await consentTarget();
      const refused = await failure(
        after({
          slug: 'consent_unanswered',
          backfill: [
            'SET LOCAL ROLE studio_maintenance;',
            unanswered.participant,
            unanswered.grant,
            'RESET ROLE;',
          ].join('\n'),
          fingerprint: releaseFingerprint(5),
        }),
      );
      expect(refused).toMatchObject({
        _tag: 'MigrationStatementFailed',
        artefact: 'backfill.sql',
        position: 'at the end of the file',
        reason: expect.stringMatching(/must answer every item/),
      });
    },
    CASE_TIMEOUT_MS,
  );

  // #1901 FX-5: a deferred check reads the settings in force when it fires.
  // Written as the owner under a team setting, a consent's check must fire
  // before that setting is reset; fired after, it would see no team's items
  // and pass a grant that answers none of them.
  it(
    'checks a consent written under a team setting before the setting is reset',
    async () => {
      const target = await consentTarget();
      const refused = await failure(
        after({
          slug: 'consent_under_team',
          backfill: [
            `SELECT set_config('app.team_id', '${target.team}', true);`,
            target.participant,
            target.grant,
            'SET CONSTRAINTS participant_consents_required_items_affirmed IMMEDIATE;',
            `SELECT set_config('app.team_id', '', true);`,
          ].join('\n'),
          fingerprint: releaseFingerprint(6),
        }),
      );
      expect(refused).toMatchObject({
        _tag: 'MigrationStatementFailed',
        artefact: 'backfill.sql',
        position: 'statement 4 of 5',
        reason: expect.stringMatching(/must answer every item/),
        rolledBack: true,
      });
    },
    CASE_TIMEOUT_MS,
  );
});
