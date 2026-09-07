import type pg from 'pg';

import {
  assertSafePostgresDatabaseEnrollment,
  copyPostgresAdministrativeLogins,
  UnsafePostgresDatabaseEnrollmentError,
} from '@codaco/studio-sync/postgres-database-enrollment';
import {
  assertSafePostgresMigrationEvidence,
  UnsafePostgresMigrationEvidenceError,
} from '@codaco/studio-sync/postgres-migration-evidence';
import {
  assertSafePostgresRestrictedIdentities,
  UnsafePostgresRestrictedIdentitiesError,
} from '@codaco/studio-sync/postgres-restricted-identities';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import {
  runtimeRolesSql,
  validateRoleNames,
} from '@codaco/studio-sync/role-bootstrap';

/** Enforce deployment access before SQL and again after historical grants. */
export async function enforceMigrationSecurity(
  client: pg.PoolClient,
  allowedLogins: readonly string[],
  administrativeLogins?: readonly string[],
): Promise<void> {
  validateRoleNames(allowedLogins);
  const copiedAdministrativeLogins = copyPostgresAdministrativeLogins(
    allowedLogins,
    administrativeLogins,
  );
  // Backup identity provisioning belongs to its own versioned sidecar. Check
  // it when present without creating a future role on an older installation.
  const optionalRoles = await client.query<{ rolname: string }>(
    'SELECT rolname FROM pg_roles WHERE rolname = $1',
    [BACKUP_ROLE],
  );
  const scopedRoles = [
    ...Object.values(TENANT_ROLES),
    ...optionalRoles.rows.map(({ rolname }) => rolname),
  ];
  await client.query(runtimeRolesSql(scopedRoles));
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
      'The migration operator must connect as itself and be explicitly enrolled in STUDIO_DATABASE_ALLOWED_LOGINS.',
    );
  }
  if (!allowedLogins.includes(operator.owner)) {
    throw new Error(
      'The Studio database owner must be explicitly enrolled in STUDIO_DATABASE_ALLOWED_LOGINS.',
    );
  }
  // Ownership and the migration connection are administrative capabilities.
  // They may belong to distinct enrolled logins; neither is a runtime identity.
  const administrators = [
    ...new Set([
      operator.operator,
      operator.owner,
      ...copiedAdministrativeLogins,
    ]),
  ];
  const restrictedLogins = allowedLogins.filter(
    (login) => !administrators.includes(login),
  );
  // Evidence is authored as standalone ordinary tables. Inheritance and
  // partition routing authorize against a parent, bypassing these tables' own
  // ACLs; inherited children also contribute rows to ordinary evidence reads.
  // Reject either direction before the runner trusts any recorded history.
  try {
    await assertSafePostgresMigrationEvidence(
      client,
      {
        history: { schema: 'studio_migrations', name: 'history' },
        fingerprint: { schema: 'public', name: 'schemaFingerprint' },
      },
      [...scopedRoles, ...restrictedLogins],
    );
  } catch (error) {
    if (
      error instanceof UnsafePostgresMigrationEvidenceError &&
      error.reason === 'trigger'
    )
      throw new Error(
        'Studio does not support SECURITY DEFINER triggers on application database relations. Their presence makes existing migration evidence untrusted; restore a verified backup before migrating.',
        { cause: error },
      );
    if (
      error instanceof UnsafePostgresMigrationEvidenceError &&
      error.reason === 'rewrite'
    )
      throw new Error(
        'Studio does not support owner-backed rewrite rules on application database relations. Their presence makes existing migration evidence untrusted; restore a verified backup before migrating.',
        { cause: error },
      );
    throw new Error(
      'Studio migration evidence must be standalone ordinary tables without inheritance, partitions, or cascading foreign-key action paths. Runtime and backup identities must hold no access outside their reviewed Studio roles; if migration evidence is writable or structurally unsafe, existing evidence is untrusted; restore a verified backup before migrating.',
      { cause: error },
    );
  }
  try {
    await assertSafePostgresRestrictedIdentities(client, {
      allowedLogins,
      administrativeLogins: [...new Set(administrators)],
      runtimeRoleSets: [[TENANT_ROLES.app], [TENANT_ROLES.maintenance]],
      backupRole: BACKUP_ROLE,
    });
  } catch (error) {
    if (error instanceof UnsafePostgresRestrictedIdentitiesError) {
      const messages: Partial<
        Record<UnsafePostgresRestrictedIdentitiesError['reason'], string>
      > = {
        'logins':
          'Enrolled Studio identities must exist and allow LOGIN; runtime and backup logins must be NOINHERIT and lack database administration or replication attributes.',
        'parents':
          'Enrolled Studio logins must not have memberships granted to unenrolled roles.',
        'memberships':
          'Application, maintenance, and backup login memberships must each grant exactly SET access to their one reviewed Studio role, without inheritance or administration; backup membership must remain separate.',
        'parameters':
          'Studio runtime and backup identities must not have SET on lo_compat_privileges or session_replication_role; migration requires lo_compat_privileges off and session_replication_role origin.',
        'persisted':
          'Studio refuses persisted lo_compat_privileges or session_replication_role defaults that bypass large-object permissions or domain triggers. Reset the applicable database and role defaults before migration.',
        'large-object-creation':
          'Studio runtime and backup identities must not execute large-object creation or server-file import/export functions. Have the database administrator revoke their PUBLIC and restricted-role EXECUTE grants before migration.',
        'access':
          'Runtime and backup identities must own no database objects and hold no access outside their reviewed Studio roles: remove direct or PUBLIC login data grants, CREATE or TEMPORARY, CONNECT grant options, executable SECURITY DEFINER routines, view, materialized view, foreign table, or large object access beyond read-only backup grants, backup table writes, or sequence UPDATE privileges.',
        'catalog':
          'Runtime and backup identities have unsupported PostgreSQL catalog capabilities or the catalog could not be verified. Ask the database administrator to investigate reserved namespace and catalog grants before migrating.',
      };
      throw new Error(
        messages[error.reason] ??
          'Studio restricted database identities could not be verified. Ask the database administrator to investigate the configured roles and privileges.',
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
        'Studio database CONNECT is available to an unenrolled login. Ask the administrator to remove its direct or inherited grant before migrating.',
        { cause: error },
      );
    if (error.reason === 'sessions')
      throw new Error(
        'Studio has existing connections from unenrolled logins. Quarantine database admission and have the administrator remove those sessions before migrating.',
        { cause: error },
      );
    throw new Error(
      'Studio database CONNECT must match the precommitted enrollment. Quarantine database admission, remove unenrolled grants, and explicitly grant CONNECT to every STUDIO_DATABASE_ALLOWED_LOGINS entry before migrating.',
      { cause: error },
    );
  }
}

/** Pending schema changes require all non-administrative sessions to be gone.
 * Deployment admission must remain closed for the entire migration window. */
export async function enforceMigrationQuiescence(
  client: pg.PoolClient,
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
      'Studio has existing runtime connections or prepared transactions. Keep admission closed and stop all web, worker and backup processes before applying pending migrations.',
    );
  }
}

/** Table REVOKE ALL also removes corresponding column grants in PostgreSQL. */
export async function protectMigrationEvidence(
  client: pg.PoolClient,
): Promise<void> {
  await client.query(`REVOKE ALL ON SCHEMA studio_migrations FROM PUBLIC, studio_app, studio_maintenance;
    REVOKE ALL ON studio_migrations.history FROM PUBLIC, studio_app, studio_maintenance;
    REVOKE ALL ON public."schemaFingerprint" FROM PUBLIC, studio_app, studio_maintenance;
    GRANT SELECT ON public."schemaFingerprint" TO studio_app, studio_maintenance`);
  const backup = await client.query<{ present: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS present',
    [BACKUP_ROLE],
  );
  if (backup.rows[0]?.present) {
    // Backup provisioning owns read access. Remove writes and delegation,
    // including column grants, without granting reads before its sidecar runs.
    await client.query(`REVOKE CREATE ON SCHEMA studio_migrations FROM ${BACKUP_ROLE};
      REVOKE GRANT OPTION FOR USAGE ON SCHEMA studio_migrations FROM ${BACKUP_ROLE};
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON studio_migrations.history, public."schemaFingerprint" FROM ${BACKUP_ROLE};
      REVOKE GRANT OPTION FOR SELECT ON studio_migrations.history, public."schemaFingerprint" FROM ${BACKUP_ROLE}`);
  }
}
