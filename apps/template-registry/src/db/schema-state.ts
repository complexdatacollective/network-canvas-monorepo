import { randomBytes } from 'node:crypto';

import { Pool, type PoolClient } from 'pg';
import { z } from 'zod';

import {
  assertSafePostgresDatabaseEnrollment,
  copyPostgresDatabaseEnrollmentOptions,
  type PostgresDatabaseEnrollmentOptions,
} from '@codaco/studio-sync/postgres-database-enrollment';
import { assertSafePostgresMigrationEvidence } from '@codaco/studio-sync/postgres-migration-evidence';
import { assertSafePostgresRestrictedIdentities } from '@codaco/studio-sync/postgres-restricted-identities';
import { assertSafePostgresRuntimeIdentity } from '@codaco/studio-sync/postgres-runtime-identity';

import {
  copyRegistryDatabasePolicy,
  type RegistryDatabaseAdmission,
} from './admission.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { REGISTRY_BACKUP_ROLE, REGISTRY_ROLES } from './schema.ts';

const stampSchema = z.strictObject({
  fingerprint: z.literal(REGISTRY_SCHEMA_FINGERPRINT),
  instance_id: z.uuid(),
});

/** Read-only boot check; the separate migration command owns every schema write. */
export async function readRegistrySchemaIdentity(
  pool: Pool | PoolClient,
  options: RegistryDatabaseAdmission,
  enrollmentOptions: PostgresDatabaseEnrollmentOptions = {},
): Promise<string> {
  try {
    const policy = copyRegistryDatabasePolicy(options);
    const enrollment = copyPostgresDatabaseEnrollmentOptions(enrollmentOptions);
    if (pool instanceof Pool) {
      const client = await pool.connect();
      let discard = false;
      try {
        await client.query('BEGIN READ ONLY');
        return await readRegistrySchemaIdentity(client, policy, enrollment);
      } catch (error) {
        discard = true;
        throw error;
      } finally {
        try {
          await client.query('ROLLBACK');
        } catch {
          discard = true;
        }
        client.release(discard);
      }
    }
    await assertSafePostgresDatabaseEnrollment(
      pool,
      policy.allowedLogins,
      enrollment,
    );
    // A development schema push can carry the same fingerprint. Only the
    // operator migration path creates this table; runtime roles cannot read
    // its contents or adopt a schema. Catalog inspection needs no history
    // schema USAGE grant, and an owner-backed view is not migration provenance.
    const provenance = await pool.query<{
      versioned: boolean;
      database_owner: string;
      session_login: string;
      current_role: string;
    }>(`
      SELECT pg_catalog.pg_get_userbyid(database.datdba) AS database_owner,
        session_user AS session_login, current_user AS current_role, EXISTS (
        SELECT 1 FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'registry_migrations'
          AND relation.relname = 'history' AND relation.relkind = 'r'
      ) AS versioned FROM pg_catalog.pg_database database
      WHERE database.datname = pg_catalog.current_database()
    `);
    const actual = provenance.rows[0];
    if (actual?.versioned !== true)
      throw new Error('REGISTRY_SCHEMA_NOT_CURRENT');
    const restrictedRoles = [
      ...Object.values(REGISTRY_ROLES),
      REGISTRY_BACKUP_ROLE,
    ];
    const protectedRoles = [
      ...new Set([
        ...restrictedRoles,
        ...policy.allowedLogins.filter(
          (login) =>
            login !== actual.database_owner &&
            !policy.administrativeLogins.includes(login),
        ),
        // A scoped serving or backup identity never inherits an administrator's
        // exception, even if its LOGIN now owns an evidence relation or database.
        ...(actual.session_login !== actual.current_role ||
        restrictedRoles.some((role) => role === actual.current_role)
          ? [actual.session_login, actual.current_role]
          : []),
      ]),
    ];
    await assertSafePostgresMigrationEvidence(
      pool,
      {
        history: { schema: 'registry_migrations', name: 'history' },
        fingerprint: { schema: 'public', name: 'registry_schema_fingerprint' },
      },
      protectedRoles,
    );
    await assertSafePostgresRestrictedIdentities(pool, policy, enrollment);
    const result = await pool.query<{
      fingerprint: string;
      instance_id: string;
    }>(
      'SELECT fingerprint, instance_id FROM public.registry_schema_fingerprint',
    );
    if (result.rows.length !== 1)
      throw new Error('REGISTRY_SCHEMA_NOT_CURRENT');
    return stampSchema.parse(result.rows[0]).instance_id;
  } catch {
    throw new Error('REGISTRY_SCHEMA_NOT_CURRENT');
  }
}

export async function verifyRegistryDatabases(
  pool: Pool,
  operatorPool: Pool,
  options: RegistryDatabaseAdmission,
): Promise<string> {
  const policy = copyRegistryDatabasePolicy(options);
  const app = await pool.connect();
  let operator: PoolClient | undefined;
  let appDiscard = false;
  let operatorDiscard = false;
  try {
    operator = await operatorPool.connect();
    await app.query('BEGIN READ ONLY');
    await operator.query('BEGIN READ ONLY');
    // Validate the actual LOGIN behind each pinned role. Keep identity, schema
    // and lock-manager checks on these same serving connections.
    await assertSafePostgresRuntimeIdentity(app, {
      ...policy,
      intendedRole: REGISTRY_ROLES.app,
      allowedRoles: [REGISTRY_ROLES.app],
    });
    await assertSafePostgresRuntimeIdentity(operator, {
      ...policy,
      intendedRole: REGISTRY_ROLES.operator,
      allowedRoles: [REGISTRY_ROLES.operator],
    });
    const identities = await Promise.all([
      readRegistrySchemaIdentity(app, policy),
      readRegistrySchemaIdentity(operator, policy),
    ]);
    if (identities[0] !== identities[1])
      throw new Error('REGISTRY_DATABASES_DO_NOT_MATCH');
    // Restores retain their installation ID. A random database-scoped lock
    // proves both sockets reach the same live PostgreSQL lock manager.
    const key = randomBytes(8).readBigInt64BE().toString();
    await app.query('SELECT pg_advisory_xact_lock($1::bigint)', [key]);
    const challenge = await operator.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [key],
    );
    if (challenge.rows[0]?.acquired !== false)
      throw new Error('REGISTRY_DATABASES_DO_NOT_MATCH');
    return identities[0];
  } catch (error) {
    appDiscard = true;
    operatorDiscard = true;
    throw error;
  } finally {
    try {
      await app.query('ROLLBACK');
    } catch {
      appDiscard = true;
    }
    try {
      await operator?.query('ROLLBACK');
    } catch {
      operatorDiscard = true;
    }
    app.release(appDiscard);
    operator?.release(operatorDiscard);
  }
}

/** The instance identity survives schema upgrades and backup restoration. */
export async function stampRegistryFingerprint(
  client: PoolClient,
  fingerprint: string,
): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(fingerprint))
    throw new Error('REGISTRY_SCHEMA_FINGERPRINT_INVALID');
  await client.query(
    `INSERT INTO public.registry_schema_fingerprint(fingerprint) VALUES ($1)
     ON CONFLICT (id) DO UPDATE SET fingerprint = excluded.fingerprint, applied_at = statement_timestamp()`,
    [fingerprint],
  );
}
