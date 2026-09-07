import type pg from 'pg';

import {
  assertSafePostgresDatabaseEnrollment,
  UnsafePostgresDatabaseEnrollmentError,
} from './postgres-database-enrollment.ts';
import {
  assertSafePostgresMigrationEvidence,
  UnsafePostgresMigrationEvidenceError,
} from './postgres-migration-evidence.ts';
import type { PostgresMigrationConfig } from './postgres-migrations.ts';
import {
  assertSafePostgresRestrictedIdentities,
  UnsafePostgresRestrictedIdentitiesError,
} from './postgres-restricted-identities.ts';
import { runtimeRolesSql, validateRoleNames } from './role-bootstrap.ts';

/** Enforce deployment access before SQL and again after historical grants. */
export async function enforceMigrationSecurity(
  client: pg.PoolClient,
  allowedLogins: readonly string[],
  config: Readonly<PostgresMigrationConfig>,
): Promise<void> {
  const {
    applicationName,
    allowedLoginsSetting,
    runtimeRoles,
    runtimeLoginRoleSets,
    backupRole,
  } = config;
  validateRoleNames(allowedLogins);
  // Backup identity provisioning belongs to its own versioned sidecar. Check
  // it when present without creating a future role on an older installation.
  const optionalRoles =
    backupRole === undefined
      ? []
      : (
          await client.query<{ rolname: string }>(
            'SELECT rolname FROM pg_roles WHERE rolname = $1',
            [backupRole],
          )
        ).rows.map(({ rolname }) => rolname);
  await client.query(
    runtimeRolesSql([...runtimeRoles, ...optionalRoles], applicationName),
  );
  const identity = await client.query<{
    operator: string;
    current: string;
    owner: string;
  }>(`SELECT session_user AS operator,
    current_user AS current, pg_get_userbyid(database.datdba) AS owner
    FROM pg_database database
    WHERE database.datname = current_database()`);
  const operator = identity.rows[0];
  if (
    !operator ||
    operator.operator !== operator.current ||
    !allowedLogins.includes(operator.operator)
  ) {
    throw new Error(
      `The migration operator must connect as itself and be explicitly enrolled in ${allowedLoginsSetting}.`,
    );
  }
  if (!allowedLogins.includes(operator.owner)) {
    throw new Error(
      `The ${applicationName} database owner must be explicitly enrolled in ${allowedLoginsSetting}.`,
    );
  }
  // Ownership and the migration connection are administrative capabilities.
  // They may belong to distinct enrolled logins; neither is a runtime identity.
  const administrators = [operator.operator, operator.owner];
  const restrictedLogins = allowedLogins.filter(
    (login) => !administrators.includes(login),
  );
  // Check the shared evidence policy before the runner trusts recorded history.
  // Protected roles remain restricted even if the evidence owner has drifted.
  try {
    await assertSafePostgresMigrationEvidence(
      client,
      {
        history: { schema: config.historySchema, name: 'history' },
        fingerprint: {
          schema: config.schemaName,
          name: config.fingerprintTable,
        },
      },
      [...runtimeRoles, ...optionalRoles, ...restrictedLogins],
    );
  } catch (error) {
    if (
      error instanceof UnsafePostgresMigrationEvidenceError &&
      error.reason === 'trigger'
    )
      throw new Error(
        `${applicationName} does not support SECURITY DEFINER triggers on application database relations. Their presence makes existing migration evidence untrusted; restore a verified backup before migrating.`,
        { cause: error },
      );
    if (
      error instanceof UnsafePostgresMigrationEvidenceError &&
      error.reason === 'rewrite'
    )
      throw new Error(
        `${applicationName} does not support owner-backed rewrite rules on application database relations. Their presence makes existing migration evidence untrusted; restore a verified backup before migrating.`,
        { cause: error },
      );
    throw new Error(
      `${applicationName} migration evidence must be standalone ordinary tables without inheritance, partitions, or cascading foreign-key action paths. Runtime and backup identities must hold no access outside their reviewed ${applicationName} roles; if migration evidence is writable or structurally unsafe, existing evidence is untrusted; restore a verified backup before migrating.`,
      { cause: error },
    );
  }
  try {
    await assertSafePostgresRestrictedIdentities(client, {
      allowedLogins,
      administrativeLogins: [...new Set(administrators)],
      runtimeRoleSets: runtimeLoginRoleSets,
      backupRole,
    });
  } catch (error) {
    if (error instanceof UnsafePostgresRestrictedIdentitiesError) {
      const runtimeScope =
        runtimeLoginRoleSets.length === 1 && runtimeRoles.length === 2
          ? `both ${applicationName} runtime roles`
          : `one configured ${applicationName} runtime role set`;
      const messages: Partial<
        Record<UnsafePostgresRestrictedIdentitiesError['reason'], string>
      > = {
        'logins': `Enrolled ${applicationName} identities must exist and allow LOGIN; runtime and backup logins must be NOINHERIT and lack database administration or replication attributes.`,
        'parents': `Enrolled ${applicationName} logins must not have memberships granted to unenrolled roles.`,
        'memberships': `Runtime and backup login memberships must grant exactly SET access to ${runtimeScope} or to the separate backup role, without inheritance or administration; backup membership must remain separate.`,
        'parameters': `${applicationName} runtime and backup identities must not have SET on lo_compat_privileges or session_replication_role; migration requires lo_compat_privileges off and session_replication_role origin.`,
        'persisted': `${applicationName} refuses persisted lo_compat_privileges or session_replication_role defaults that bypass large-object permissions or domain triggers. Reset the applicable database and role defaults before migration.`,
        'large-object-creation': `${applicationName} runtime and backup identities must not execute large-object creation or server-file import/export functions. Have the database administrator revoke their PUBLIC and restricted-role EXECUTE grants before migration.`,
        'access': `Runtime and backup identities must own no database objects and hold no access outside their reviewed ${applicationName} roles: remove direct or PUBLIC login data grants, CREATE, TEMPORARY, CONNECT grant options, executable SECURITY DEFINER routines, view, materialized view, foreign table, or large object access beyond read-only backup grants, backup table writes, or sequence UPDATE privileges.`,
        'catalog': `${applicationName} runtime and backup identities have unsafe PostgreSQL catalog privileges.`,
      };
      throw new Error(
        messages[error.reason] ??
          `${applicationName} restricted database identities could not be verified. Ask the database administrator to investigate the configured roles and privileges.`,
        { cause: error },
      );
    }
    throw error;
  }
  try {
    await assertSafePostgresDatabaseEnrollment(client, allowedLogins);
  } catch (error) {
    if (!(error instanceof UnsafePostgresDatabaseEnrollmentError)) throw error;
    if (error.reason === 'outsider')
      throw new Error(
        `${applicationName} database CONNECT is available to an unenrolled login. Ask the administrator to remove its direct or inherited grant before migrating.`,
        { cause: error },
      );
    if (error.reason === 'sessions')
      throw new Error(
        `${applicationName} has existing connections from unenrolled logins. Quarantine database admission and have the administrator remove those sessions before migrating.`,
        { cause: error },
      );
    throw new Error(
      `${applicationName} database CONNECT must match the precommitted enrollment. Quarantine database admission, remove unenrolled grants, and explicitly grant CONNECT to every ${allowedLoginsSetting} entry before migrating.`,
      { cause: error },
    );
  }
}

/** Pending schema changes require all non-administrative sessions to be gone.
 * Deployment admission must remain closed for the entire migration window. */
export async function enforceMigrationQuiescence(
  client: pg.PoolClient,
  applicationName: string,
): Promise<void> {
  await client.query('SELECT pg_stat_clear_snapshot()');
  const sessions = await client.query<{ present: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity activity
        JOIN pg_roles login ON login.oid = activity.usesysid
        JOIN pg_database database ON database.datname = activity.datname
      WHERE activity.datname = current_database() AND NOT login.rolsuper
        AND login.oid <> database.datdba AND login.rolname <> session_user
    ) OR EXISTS (
      SELECT 1 FROM pg_prepared_xacts prepared
        JOIN pg_roles owner_role ON owner_role.rolname = prepared.owner
        JOIN pg_database database ON database.datname = prepared.database
      WHERE prepared.database = current_database() AND NOT owner_role.rolsuper
        AND owner_role.oid <> database.datdba
        AND owner_role.rolname <> session_user
    ) AS present
  `);
  if (sessions.rows[0]?.present !== false) {
    throw new Error(
      `${applicationName} has existing runtime connections or prepared transactions. Keep admission closed and stop all web, worker and backup processes before applying pending migrations.`,
    );
  }
}
