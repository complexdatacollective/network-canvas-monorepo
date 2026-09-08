import { escapeLiteral } from 'pg';
import type pg from 'pg';

import { copyPostgresAdministrativeLogins } from '@codaco/studio-sync/postgres-database-enrollment';
import { validateRoleNames } from '@codaco/studio-sync/role-bootstrap';

import { SCHEMA_LOCK_KEY, stampFingerprint } from '../schema.ts';
import type { Migration } from './artifact.ts';
import {
  enforceMigrationSecurity,
  enforceMigrationQuiescence,
  protectMigrationEvidence,
} from './security.ts';

type AppliedMigration = {
  position: number;
  id: string;
  checksum: string;
  fingerprint: string;
};

const HISTORY_TABLE = 'studio_migrations.history';

async function executeAtomicSql(
  client: pg.PoolClient,
  sql: string,
): Promise<void> {
  if (!sql.trim()) return;
  // PostgreSQL's atomic PL/pgSQL execution context rejects transaction
  // control, including commands inside nested DO/CALL statements. Quoting
  // both literals with pg keeps dollar-quoted function bodies and comments
  // intact without a second SQL parser. A raw client.query(sql) would let an
  // authored COMMIT release our lock and escape the rollback guarantee.
  await client.query(
    `DO ${escapeLiteral(`BEGIN EXECUTE ${escapeLiteral(sql)}; END;`)}`,
  );
}

async function hasPublicObjects(client: pg.PoolClient): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class object
      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = 'public'
      UNION ALL
      SELECT 1 FROM pg_proc object
      JOIN pg_namespace namespace ON namespace.oid = object.pronamespace
      WHERE namespace.nspname = 'public'
      UNION ALL
      SELECT 1 FROM pg_type object
      JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
      WHERE namespace.nspname = 'public'
    ) AS present
  `);
  return result.rows[0]?.present ?? true;
}

async function verifyFingerprint(
  client: pg.PoolClient,
  expected: string,
): Promise<void> {
  const table = await client.query<{ present: boolean }>(
    `SELECT to_regclass('public."schemaFingerprint"') IS NOT NULL AS present`,
  );
  if (!table.rows[0]?.present)
    throw new Error(
      'Migration history exists but the schema fingerprint is absent.',
    );
  const result = await client.query<{ fingerprint: string }>(
    'SELECT fingerprint FROM public."schemaFingerprint"',
  );
  if (result.rows.length !== 1 || result.rows[0]?.fingerprint !== expected) {
    throw new Error(
      'The database fingerprint does not match its migration history; restore a consistent backup before migrating.',
    );
  }
}

/**
 * Only an explicit deployment command calls this. All pending SQL, sidecars,
 * history and fingerprints commit together, under the same lock development
 * schema application uses. A failed migration leaves the previous data/schema
 * intact; nothing reconciles or adopts an unknown database.
 */
export async function migrateDatabase(
  pool: pg.Pool,
  migrations: readonly Migration[],
  expectedFingerprint: string,
  allowedLogins: readonly string[],
  administrativeLogins?: readonly string[],
): Promise<string[]> {
  // Snapshot the deployment's explicit offline-administrator inventory before
  // acquiring the client. Every security check in this transaction must use
  // the same validated policy as migration-command admission.
  const copiedAllowedLogins = [...allowedLogins];
  validateRoleNames(copiedAllowedLogins);
  const copiedAdministrativeLogins = copyPostgresAdministrativeLogins(
    copiedAllowedLogins,
    administrativeLogins,
  );
  if (
    migrations.length === 0 ||
    migrations.at(-1)?.manifest.fingerprint !== expectedFingerprint
  ) {
    throw new Error(
      'The shipped migration history does not reach this Studio build; generate and commit its migration before building.',
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      SCHEMA_LOCK_KEY,
    ]);
    // Fixed and transaction-local: DATABASE_URL options cannot redirect DDL or
    // the stamp into an arbitrary schema. The runtime also uses public.
    await client.query("SELECT set_config('search_path', 'public', true)");
    // Catalog-only checks must precede every read of stored evidence. A valid
    // checksum cannot establish integrity while runtime identities can forge it.
    await enforceMigrationSecurity(
      client,
      copiedAllowedLogins,
      copiedAdministrativeLogins,
    );
    const probe = await client.query<{ present: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS present',
      [HISTORY_TABLE],
    );
    const applied = probe.rows[0]?.present
      ? (
          await client.query<AppliedMigration>(
            `SELECT position, id, checksum, fingerprint FROM ${HISTORY_TABLE} ORDER BY position`,
          )
        ).rows
      : [];

    if (applied.length === 0 && (await hasPublicObjects(client))) {
      throw new Error(
        'This database has no versioned Studio migration history but public is not empty. Pre-release databases are not adopted automatically. Preserve a backup and export their data with the original build; provision a separate empty database with this image. Do not delete the original database or forge migration history.',
      );
    }
    for (const [index, recorded] of applied.entries()) {
      const shipped = migrations[index];
      if (
        !shipped ||
        recorded.position !== index + 1 ||
        recorded.id !== shipped.manifest.id ||
        recorded.checksum !== shipped.checksum ||
        recorded.fingerprint !== shipped.manifest.fingerprint
      ) {
        throw new Error(
          `Applied migration history differs from this image at ${recorded.id}; downgrade or edited migrations are not supported.`,
        );
      }
    }
    const previous = applied.at(-1);
    if (previous) await verifyFingerprint(client, previous.fingerprint);
    const pending = applied.length < migrations.length;
    if (pending) await enforceMigrationQuiescence(client);

    await enforceMigrationSecurity(
      client,
      copiedAllowedLogins,
      copiedAdministrativeLogins,
    );

    await client.query(`CREATE SCHEMA IF NOT EXISTS studio_migrations;
      REVOKE ALL ON SCHEMA studio_migrations FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
        position integer PRIMARY KEY CHECK (position > 0),
        id text NOT NULL UNIQUE,
        checksum text NOT NULL,
        fingerprint text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
      )`);
    const completed: string[] = [];
    for (const [index, migration] of migrations.entries()) {
      if (index < applied.length) continue;
      // Sidecars are the immutable copy from THIS migration, never imports
      // from today's source. Their order preserves narrow security revocations.
      await executeAtomicSql(client, migration.sql);
      await executeAtomicSql(client, migration.sidecars);
      // Historical sidecars may grant broad evidence privileges. Contain those
      // uncommitted grants before another migration or evidence write executes.
      await protectMigrationEvidence(client);
      await enforceMigrationSecurity(
        client,
        copiedAllowedLogins,
        copiedAdministrativeLogins,
      );
      await stampFingerprint(client, migration.manifest.fingerprint);
      await client.query(
        `INSERT INTO ${HISTORY_TABLE} (position, id, checksum, fingerprint) VALUES ($1, $2, $3, $4)`,
        [
          index + 1,
          migration.manifest.id,
          migration.checksum,
          migration.manifest.fingerprint,
        ],
      );
      completed.push(migration.manifest.id);
    }
    // Repeatable security is independent of historical schema checksums. It
    // runs on no-op migrations too and contains grants in every old sidecar.
    await protectMigrationEvidence(client);
    await enforceMigrationSecurity(
      client,
      copiedAllowedLogins,
      copiedAdministrativeLogins,
    );
    await verifyFingerprint(client, expectedFingerprint);
    // Refresh after SQL so a runtime that breaches the deployment drain
    // cannot remain connected while this transaction commits a new schema.
    if (pending) await enforceMigrationQuiescence(client);
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
