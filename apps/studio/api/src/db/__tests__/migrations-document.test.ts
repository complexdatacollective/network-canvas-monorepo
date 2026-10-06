import { afterAll, describe, expect, it } from 'vitest';

import {
  committedDocument,
  createOwnedScratchDatabase,
  type OwnedScratchDatabase,
  withMigrations,
} from '../../__tests__/support/migrations.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../fingerprint.generated.ts';
import {
  type DocumentMigration,
  forbiddenStatement,
  type MigrationsDocument,
  MigrationsDocumentRefused,
  verifyMigrations,
  VerifiedMigrations,
} from '../migrations-document.ts';
import { splitStatements } from '../statements.ts';

const committed = committedDocument();

const refusalOf = (
  document: MigrationsDocument,
  fingerprint = document.fingerprint,
): MigrationsDocumentRefused => {
  try {
    verifyMigrations(document, fingerprint);
  } catch (error) {
    if (error instanceof MigrationsDocumentRefused) return error;
    throw error;
  }
  throw new Error('the document was accepted');
};

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
    const verified = verifyMigrations(committed);
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
    expect(forbiddenStatement('CREATE INDEX CONCURRENTLY i ON t (c);')).toMatch(
      /CONCURRENTLY/,
    );
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
    expect(refusalOf(concurrent).message).toMatch(/split it into two releases/);
  });
});

const db = await reachableDb();

describe.skipIf(!db)('every committed artefact', () => {
  const scratches: OwnedScratchDatabase[] = [];
  afterAll(async () => {
    for (const scratch of scratches) await scratch.dispose();
  }, 120_000);

  it('survives splitStatements and installs inside one transaction', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const scratch = await createOwnedScratchDatabase(db);
    scratches.push(scratch);

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
