import { escapeIdentifier, escapeLiteral } from 'pg';
import type pg from 'pg';

import type { Migration } from './postgres-migration-artifacts.ts';
import {
  enforceMigrationSecurity,
  enforceMigrationQuiescence,
} from './postgres-migration-security.ts';
import { validateRoleNames } from './role-bootstrap.ts';

export type PostgresMigrationConfig = {
  readonly applicationName: string;
  readonly allowedLoginsSetting: string;
  readonly runtimeRoles: readonly string[];
  /** Exact direct membership sets for runtime logins, independent of ordering.
   * The optional backup role is a separate singleton, never part of these sets. */
  readonly runtimeLoginRoleSets: readonly (readonly string[])[];
  /** Validate this role when present; its own migration provisions it. */
  readonly backupRole?: string;
  /** Dedicated history schema; must differ from the application schema. */
  readonly historySchema: string;
  readonly schemaName: string;
  readonly fingerprintTable: string;
  /** Use the same key as this application's development schema writer. */
  readonly lockKey: number;
  readonly stampFingerprint: (
    client: pg.PoolClient,
    fingerprint: string,
  ) => Promise<void>;
};

/** Configure one application's immutable history without changing the engine. */
export function createPostgresMigrator(input: PostgresMigrationConfig) {
  // Validate and capture configuration before a caller can connect or write.
  // PostgreSQL identifiers are quoted in every statement that interpolates one.
  for (const identifier of [
    input.historySchema,
    input.schemaName,
    input.fingerprintTable,
  ]) {
    validateRoleNames([identifier]);
  }
  validateRoleNames(input.runtimeRoles);
  if (
    !Array.isArray(input.runtimeLoginRoleSets) ||
    input.runtimeLoginRoleSets.length === 0
  ) {
    throw new Error('Supply valid PostgreSQL runtime login role sets.');
  }
  for (const roles of input.runtimeLoginRoleSets) {
    validateRoleNames(roles);
    if (roles.some((role) => !input.runtimeRoles.includes(role))) {
      throw new Error('Supply valid PostgreSQL runtime login role sets.');
    }
  }
  if (
    input.runtimeRoles.some(
      (role) =>
        !input.runtimeLoginRoleSets.some((roles) => roles.includes(role)),
    ) ||
    input.runtimeLoginRoleSets.some((roles, index) =>
      input.runtimeLoginRoleSets
        .slice(0, index)
        .some(
          (previous) =>
            previous.length === roles.length &&
            previous.every((role) => roles.includes(role)),
        ),
    )
  ) {
    throw new Error('Supply valid PostgreSQL runtime login role sets.');
  }
  if (input.backupRole !== undefined) {
    validateRoleNames([...input.runtimeRoles, input.backupRole]);
  }
  if (
    !/^[A-Za-z][A-Za-z0-9 ]{0,63}$/.test(input.applicationName) ||
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.allowedLoginsSetting) ||
    !Number.isSafeInteger(input.lockKey) ||
    input.historySchema === input.schemaName
  ) {
    throw new Error('Supply valid PostgreSQL migration configuration.');
  }
  const config: PostgresMigrationConfig = Object.freeze({
    ...input,
    runtimeRoles: Object.freeze([...input.runtimeRoles]),
    runtimeLoginRoleSets: Object.freeze(
      input.runtimeLoginRoleSets.map((roles) => Object.freeze([...roles])),
    ),
  });
  return {
    migrate: (
      pool: pg.Pool,
      migrations: readonly Migration[],
      expectedFingerprint: string,
      allowedLogins: readonly string[],
    ) =>
      migrateDatabase(
        pool,
        migrations,
        expectedFingerprint,
        [...allowedLogins],
        config,
      ),
    /** The caller owns the transaction, for repeatable security checks. */
    enforceSecurity: (
      client: pg.PoolClient,
      allowedLogins: readonly string[],
    ) => enforceMigrationSecurity(client, [...allowedLogins], config),
  };
}

type AppliedMigration = {
  position: number;
  id: string;
  checksum: string;
  fingerprint: string;
};

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

async function hasSchemaObjects(
  client: pg.PoolClient,
  schemaName: string,
): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1 FROM pg_class object
      JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
      WHERE namespace.nspname = $1
      UNION ALL
      SELECT 1 FROM pg_proc object
      JOIN pg_namespace namespace ON namespace.oid = object.pronamespace
      WHERE namespace.nspname = $1
      UNION ALL
      SELECT 1 FROM pg_type object
      JOIN pg_namespace namespace ON namespace.oid = object.typnamespace
      WHERE namespace.nspname = $1
    ) AS present
  `,
    [schemaName],
  );
  return result.rows[0]?.present ?? true;
}

async function verifyFingerprint(
  client: pg.PoolClient,
  expected: string,
  fingerprintTable: string,
): Promise<void> {
  const table = await client.query<{ present: boolean }>(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [fingerprintTable],
  );
  if (!table.rows[0]?.present)
    throw new Error(
      'Migration history exists but the schema fingerprint is absent.',
    );
  const result = await client.query<{ fingerprint: string }>(
    `SELECT fingerprint FROM ${fingerprintTable}`,
  );
  if (result.rows.length !== 1 || result.rows[0]?.fingerprint !== expected) {
    throw new Error(
      'The database fingerprint does not match its migration history; restore a consistent backup before migrating.',
    );
  }
}

async function protectMigrationEvidence(
  client: pg.PoolClient,
  config: PostgresMigrationConfig,
): Promise<void> {
  const { historySchema, schemaName } = config;
  const historyTable = `${escapeIdentifier(historySchema)}.history`;
  const fingerprintTable = `${escapeIdentifier(schemaName)}.${escapeIdentifier(config.fingerprintTable)}`;
  // Table REVOKE ALL also removes corresponding column grants in PostgreSQL.
  const roles = config.runtimeRoles.map(escapeIdentifier).join(', ');
  await client.query(`REVOKE ALL ON SCHEMA ${escapeIdentifier(historySchema)} FROM PUBLIC, ${roles};
    REVOKE ALL ON ${historyTable} FROM PUBLIC, ${roles};
    REVOKE ALL ON ${fingerprintTable} FROM PUBLIC, ${roles};
    GRANT SELECT ON ${fingerprintTable} TO ${roles}`);
  if (config.backupRole !== undefined) {
    const backup = await client.query<{ present: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present',
      [config.backupRole],
    );
    if (backup.rows[0]?.present) {
      // Backup provisioning owns read access. Remove writes and delegation,
      // including column grants, without granting reads before its sidecar runs.
      const backupRole = escapeIdentifier(config.backupRole);
      await client.query(`REVOKE CREATE ON SCHEMA ${escapeIdentifier(historySchema)} FROM ${backupRole};
        REVOKE GRANT OPTION FOR USAGE ON SCHEMA ${escapeIdentifier(historySchema)} FROM ${backupRole};
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ${historyTable}, ${fingerprintTable} FROM ${backupRole};
        REVOKE GRANT OPTION FOR SELECT ON ${historyTable}, ${fingerprintTable} FROM ${backupRole}`);
    }
  }
}

/**
 * Only an explicit deployment command calls this. All pending SQL, sidecars,
 * history and fingerprints commit together, under the same lock development
 * schema application uses. A failed migration leaves the previous data/schema
 * intact; nothing reconciles or adopts an unknown database.
 */
async function migrateDatabase(
  pool: pg.Pool,
  migrations: readonly Migration[],
  expectedFingerprint: string,
  allowedLogins: readonly string[],
  config: PostgresMigrationConfig,
): Promise<string[]> {
  const {
    applicationName,
    historySchema,
    schemaName,
    lockKey,
    stampFingerprint,
  } = config;
  const historyTable = `${escapeIdentifier(historySchema)}.history`;
  const fingerprintTable = `${escapeIdentifier(schemaName)}.${escapeIdentifier(config.fingerprintTable)}`;
  if (
    migrations.length === 0 ||
    migrations.at(-1)?.manifest.fingerprint !== expectedFingerprint
  ) {
    throw new Error(
      `The shipped migration history does not reach this ${applicationName} build; generate and commit its migration before building.`,
    );
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey]);
    // Fixed and transaction-local: DATABASE_URL options cannot redirect DDL or
    // the stamp into an arbitrary schema.
    await client.query("SELECT set_config('search_path', $1, true)", [
      escapeIdentifier(schemaName),
    ]);
    // Catalog-only checks must precede every read of stored evidence. A valid
    // checksum cannot establish integrity while runtime identities can forge it.
    await enforceMigrationSecurity(client, allowedLogins, config);
    const probe = await client.query<{ present: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS present',
      [historyTable],
    );
    const applied = probe.rows[0]?.present
      ? (
          await client.query<AppliedMigration>(
            `SELECT position, id, checksum, fingerprint FROM ${historyTable} ORDER BY position`,
          )
        ).rows
      : [];

    if (applied.length === 0 && (await hasSchemaObjects(client, schemaName))) {
      throw new Error(
        `This database has no versioned ${applicationName} migration history but ${schemaName} is not empty. Pre-release databases are not adopted automatically. Preserve a backup and export their data with the original build; provision a separate empty database with this image. Do not delete the original database or forge migration history.`,
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
    if (previous)
      await verifyFingerprint(client, previous.fingerprint, fingerprintTable);
    const pending = applied.length < migrations.length;
    if (pending) await enforceMigrationQuiescence(client, applicationName);

    await client.query(`CREATE SCHEMA IF NOT EXISTS ${escapeIdentifier(historySchema)};
      REVOKE ALL ON SCHEMA ${escapeIdentifier(historySchema)} FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS ${historyTable} (
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
      await protectMigrationEvidence(client, config);
      await enforceMigrationSecurity(client, allowedLogins, config);
      await stampFingerprint(client, migration.manifest.fingerprint);
      await client.query(
        `INSERT INTO ${historyTable} (position, id, checksum, fingerprint) VALUES ($1, $2, $3, $4)`,
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
    await protectMigrationEvidence(client, config);
    await enforceMigrationSecurity(client, allowedLogins, config);
    await verifyFingerprint(client, expectedFingerprint, fingerprintTable);
    // Refresh after SQL so a runtime that breaches the deployment drain
    // cannot remain connected while this transaction commits a new schema.
    if (pending) await enforceMigrationQuiescence(client, applicationName);
    await client.query('COMMIT');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
