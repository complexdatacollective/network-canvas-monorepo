import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  committedDocument,
  ownedScratchDatabaseForTest,
  withMigrations,
} from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import {
  type DocumentMigration,
  forbiddenStatement,
  type MigrationsDocument,
  type MigrationsDocumentRefused,
  verifyMigrations,
  VerifiedMigrations,
} from '../migrations-document.ts';
import { splitStatements } from '../statements.ts';

const committed = committedDocument();

const refusalOf = (
  document: MigrationsDocument,
  fingerprint = document.fingerprint,
): MigrationsDocumentRefused =>
  Effect.runSync(
    verifyMigrations(document, fingerprint).pipe(
      Effect.andThen(() => Effect.die(new Error('the document was accepted'))),
      Effect.flip,
    ),
  );

/** One migration of the document, rebuilt by `change`. */
function changing(
  document: MigrationsDocument,
  index: number,
  change: (migration: DocumentMigration) => DocumentMigration,
): MigrationsDocument {
  return {
    ...document,
    migrations: document.migrations.map((migration, at) =>
      at === index ? change(migration) : migration,
    ),
  };
}

describe('the committed migrations document', () => {
  it('verifies against this build’s fingerprint', () => {
    expect(committed.migrations.length).toBeGreaterThan(0);
    const verified = Effect.runSync(verifyMigrations(committed));
    expect(verified).toBeInstanceOf(VerifiedMigrations);
    expect(verified.fingerprint).toBe(SCHEMA_FINGERPRINT);
    expect(verified.migrations).toEqual(committed.migrations);
  });

  it('is refused when it records another build’s fingerprint', () => {
    expect(
      refusalOf(
        { ...committed, fingerprint: 'f'.repeat(64) },
        SCHEMA_FINGERPRINT,
      ).message,
    ).toMatch(/rendered by a different build/);
  });

  it('is refused when one artefact is truncated', () => {
    const truncated = changing(committed, 0, (migration) => ({
      ...migration,
      artefacts: migration.artefacts.map((artefact) =>
        artefact.name === 'sidecars.sql'
          ? { ...artefact, sql: artefact.sql.slice(0, -1) }
          : artefact,
      ),
    }));
    expect(refusalOf(truncated).message).toMatch(
      /sidecars\.sql does not hash to its manifest/,
    );
  });

  it('is refused when one artefact is edited, even by a comment', () => {
    const edited = changing(committed, 0, (migration) => ({
      ...migration,
      artefacts: migration.artefacts.map((artefact) =>
        artefact.name === 'delta.sql'
          ? { ...artefact, sql: `${artefact.sql}\n-- edited` }
          : artefact,
      ),
    }));
    expect(refusalOf(edited).message).toMatch(
      /delta\.sql does not hash to its manifest/,
    );
  });

  it('is refused when an artefact is dropped from it', () => {
    const dropped = changing(committed, 0, (migration) => ({
      ...migration,
      artefacts: migration.artefacts.filter(
        (artefact) => artefact.name !== 'sidecars.sql',
      ),
    }));
    expect(refusalOf(dropped).message).toMatch(/no sidecars\.sql|records/);
  });

  it('is refused when its manifest records an artefact the migration does not carry', () => {
    const extra = changing(committed, 0, (migration) => ({
      ...migration,
      manifest: {
        ...migration.manifest,
        artefacts: {
          ...migration.manifest.artefacts,
          'extra.sql': 'a'.repeat(64),
        },
      },
    }));
    expect(refusalOf(extra).message).toMatch(/manifest records .*extra\.sql/);
  });

  it('is refused when a manifest’s combined hash was edited', () => {
    const edited = changing(committed, 0, (migration) => ({
      ...migration,
      manifest: { ...migration.manifest, combined: 'a'.repeat(64) },
    }));
    expect(refusalOf(edited).message).toMatch(/combined hash/);
  });

  it('is refused when the newest migration lags the schema', () => {
    // A schema change with no migration: the build's fingerprint moved, and
    // the newest manifest still names the old one.
    expect(
      refusalOf({ ...committed, fingerprint: 'b'.repeat(64) }, 'b'.repeat(64))
        .message,
    ).toMatch(/changed without a migration/);
  });

  it('is refused when the ordinals are not contiguous', () => {
    const extended = withMigrations(
      committed,
      { slug: 'second', fingerprint: 'b'.repeat(64) },
      { slug: 'third', fingerprint: 'c'.repeat(64) },
    );
    const gap = {
      ...extended,
      migrations: extended.migrations.filter(
        (_, index) => index !== extended.migrations.length - 2,
      ),
    };
    expect(refusalOf(gap).message).toMatch(/not numbered contiguously/);
    expect(refusalOf({ ...committed, migrations: [] }).message).toMatch(
      /carries no migrations/,
    );
  });

  it('refuses a statement one transaction cannot run', () => {
    expect(
      forbiddenStatement('CREATE INDEX CONCURRENTLY i ON t (c);'),
    ).toMatchObject({
      statement: expect.stringMatching(/CONCURRENTLY/),
      remedy: expect.stringMatching(/split it across two releases/),
    });
    expect(
      forbiddenStatement(`ALTER TYPE mood ADD VALUE 'happy';`),
    ).not.toBeNull();
    expect(
      forbiddenStatement(
        '-- built concurrently later\nCREATE INDEX i ON t (c);',
      ),
    ).toBeNull();
    const concurrent = withMigrations(committed, {
      slug: 'concurrent',
      delta: 'CREATE INDEX CONCURRENTLY probe_idx ON drafts (team_id);',
      fingerprint: 'b'.repeat(64),
    });
    expect(refusalOf(concurrent).message).toMatch(
      /split it across two releases/,
    );
  });

  // #1901 E-1: an inner COMMIT commits half an upgrade, and an inner ROLLBACK
  // undoes statements the history then records as applied.
  it.each([
    'BEGIN',
    'begin transaction isolation level serializable',
    'START TRANSACTION',
    'start\n  transaction read write',
    'COMMIT',
    'commit and chain',
    'END',
    'end transaction',
    'ROLLBACK',
    'rollback to savepoint before_backfill',
    'ABORT',
    'SAVEPOINT before_backfill',
    'release savepoint before_backfill',
    'RELEASE before_backfill',
    "PREPARE TRANSACTION 'upgrade'",
    "COMMIT PREPARED 'upgrade'",
    "ROLLBACK PREPARED 'upgrade'",
    'SET TRANSACTION READ ONLY',
    'set local transaction isolation level serializable',
    'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY',
    '-- a habit\nCommit',
    '-- a carriage return ends a comment\rCOMMIT',
    '/* outer /* nested */ still a comment */ COMMIT',
    '  \t\n  rollback',
  ])('refuses transaction control: %j', (statement) => {
    expect(forbiddenStatement(`UPDATE t SET c = 1;\n${statement};`)).toEqual({
      statement: statement.trim(),
      remedy: expect.stringMatching(/one transaction of its own/),
    });
  });

  it.each([
    `DO $$ BEGIN RAISE NOTICE 'x'; END $$`,
    'CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql',
    "SELECT 'commit'",
    'UPDATE t SET "end" = 1, "begin" = 2',
    '-- COMMIT\nSELECT 1',
    '/* ROLLBACK */ SELECT 1',
    'SET CONSTRAINTS interview_sessions_completion_snapshot IMMEDIATE',
    'SET CONSTRAINTS public.a, public.b DEFERRED',
    'SET LOCAL ROLE studio_maintenance',
    'RESET ROLE',
    'CREATE TABLE commits (id int)',
    'ENDPOINT_PROBE',
  ])('admits a statement that only mentions a transaction: %j', (statement) => {
    expect(forbiddenStatement(`${statement};`)).toBeNull();
  });

  // Only executable SQL is classified: the same words inside a string, a
  // quoted name or a function body are values, not commands.
  it.each([
    "UPDATE drafts SET note = 'run concurrently'",
    "COMMENT ON TABLE drafts IS 'ALTER TYPE mood ADD VALUE happy'",
    "UPDATE drafts SET note = E'built \\'concurrently\\''",
    'SELECT 1 AS "concurrently"',
    "CREATE FUNCTION f() RETURNS text AS $body$ SELECT 'CREATE INDEX CONCURRENTLY' $body$ LANGUAGE sql",
  ])(
    'admits a statement whose quoted text only mentions one: %j',
    (statement) => {
      expect(forbiddenStatement(`${statement};`)).toBeNull();
    },
  );

  // A `--` inside a quoted name is not a comment, so it cannot hide the rest
  // of the line from the check.
  it('sees a command past a quoted name that carries a comment marker', () => {
    expect(
      forbiddenStatement(`ALTER TYPE "my--type" ADD VALUE 'happy';`),
    ).toMatchObject({
      remedy: expect.stringMatching(/split it across two releases/),
    });
  });

  // #1901 FX-7: read as one chunk, the COMMIT after a CR-only comment would
  // hide behind the comment from this check.
  it('sees a COMMIT after a comment ended by a carriage return', () => {
    expect(forbiddenStatement('-- note\rCOMMIT;\nSELECT 1;')).toEqual({
      statement: '-- note\rCOMMIT',
      remedy: expect.stringMatching(/one transaction of its own/),
    });
    expect(
      forbiddenStatement('-- note\rCREATE INDEX CONCURRENTLY i ON t (c);'),
    ).toMatchObject({
      remedy: expect.stringMatching(/split it across two releases/),
    });
  });

  // #1901 FX-4: ALL sets the transaction's default, which a later file's own
  // INITIALLY DEFERRED constraint would then follow.
  it.each([
    'SET CONSTRAINTS ALL IMMEDIATE',
    'set constraints all deferred',
    '-- settle\nSET  CONSTRAINTS\n  ALL IMMEDIATE',
  ])('refuses SET CONSTRAINTS ALL: %j', (statement) => {
    expect(forbiddenStatement(`UPDATE t SET c = 1;\n${statement};`)).toEqual({
      statement: statement.trim(),
      remedy: expect.stringMatching(
        /^name the constraints instead .* every file after this one/,
      ),
    });
  });

  it('refuses a migration whose backfill carries transaction control', () => {
    const wrapped = withMigrations(committed, {
      slug: 'wrapped',
      delta: 'ALTER TABLE deployment_state ADD COLUMN probe text;',
      backfill: 'BEGIN;\nUPDATE deployment_state SET probe = 1;\nCOMMIT;',
      fingerprint: 'b'.repeat(64),
    });
    expect(refusalOf(wrapped).message).toMatch(
      /_wrapped's backfill\.sql carries a statement one transaction cannot run; remove it: .*: BEGIN$/,
    );
  });
});

const db = await reachableDb();

describe.skipIf(!db)('every committed artefact', () => {
  it('survives splitStatements and installs inside one transaction', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await ownedScratchDatabaseForTest(db);

    const statements = committed.migrations.flatMap((migration) =>
      migration.artefacts.flatMap((artefact) =>
        splitStatements(artefact.sql).map((statement) => ({
          where: `${migration.version}/${artefact.name}`,
          statement,
        })),
      ),
    );
    expect(statements.length).toBeGreaterThan(0);
    expect(
      statements.filter(({ statement }) => /\bCONCURRENTLY\b/i.test(statement)),
    ).toEqual([]);

    const client = await scratch.pool.connect();
    try {
      await client.query('begin');
      for (const { where, statement } of statements) {
        await client.query(statement).catch((error: unknown) => {
          throw new Error(
            `${where}: ${error instanceof Error ? error.message : String(error)}\n${statement}`,
          );
        });
      }
      await client.query('commit');
    } finally {
      client.release();
    }

    const tables = await scratch.pool.query<{ count: number }>(
      `select count(*)::int as count from pg_tables where schemaname = 'public'`,
    );
    expect(tables.rows[0]?.count).toBeGreaterThan(0);
  }, 120_000);
});
