import type pg from 'pg';

import { assertSafePostgresCatalogPrivileges } from './postgres-catalog-privileges.ts';
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
  runtimeRolesSql,
  RESTRICTED_LARGE_OBJECT_FUNCTIONS,
  validateRoleNames,
} from './role-bootstrap.ts';

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
  const logins = await client.query<{ rolname: string; safe: boolean }>(
    `SELECT rolname, rolcanlogin AND (rolname = ANY($2::text[]) OR NOT (
      rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit
    )) AS safe FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [allowedLogins, administrators],
  );
  if (
    logins.rows.length !== allowedLogins.length ||
    logins.rows.some(({ safe }) => !safe)
  ) {
    throw new Error(
      `Enrolled ${applicationName} identities must exist and allow LOGIN; runtime and backup logins must be NOINHERIT and lack database administration or replication attributes.`,
    );
  }
  // An outside role able to become an enrolled login can restore CONNECT or
  // use its ownership privileges, even with INHERIT FALSE on that membership.
  const memberships = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
    SELECT 1 FROM pg_auth_members membership
      JOIN pg_roles enrolled ON enrolled.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
    WHERE enrolled.rolname = ANY($1::text[]) AND NOT member.rolsuper
      AND NOT member.rolname = ANY($1::text[])
  ) AS present`,
    [allowedLogins],
  );
  if (memberships.rows[0]?.present) {
    throw new Error(
      `Enrolled ${applicationName} logins must not have memberships granted to unenrolled roles.`,
    );
  }
  // SET ROLE NONE restores session_user despite the pool's pinned startup
  // role. A login must therefore carry only SET access to the reviewed roles:
  // no owner/login/built-in chains, inherited privileges, or role administration.
  const scopedMemberships = await client.query<{ safe: boolean }>(
    `SELECT NOT EXISTS (
      SELECT 1 FROM pg_auth_members membership
        JOIN pg_roles login ON login.oid = membership.member
        JOIN pg_roles parent ON parent.oid = membership.roleid
      WHERE login.rolname = ANY($1::text[]) AND (
        NOT parent.rolname = ANY($2::text[]) OR membership.admin_option
        OR membership.inherit_option OR NOT membership.set_option
        OR (parent.rolname = $3 AND EXISTS (
          SELECT 1 FROM pg_auth_members sibling
          WHERE sibling.member = login.oid AND sibling.roleid <> parent.oid
        ))
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_roles login WHERE login.rolname = ANY($1::text[])
        AND NOT (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements($4::jsonb) required_set
            WHERE NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(required_set) required_role
              WHERE NOT EXISTS (
                SELECT 1 FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid
                WHERE membership.member = login.oid AND parent.rolname = required_role
              )
            ) AND NOT EXISTS (
              SELECT 1 FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid
              WHERE membership.member = login.oid AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(required_set) required_role
                WHERE parent.rolname = required_role
              )
            )
          ) OR EXISTS (
            SELECT 1 FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid
            WHERE membership.member = login.oid AND parent.rolname = $3
          )
        )
    ) AS safe`,
    [
      restrictedLogins,
      [...runtimeRoles, ...optionalRoles],
      backupRole ?? null,
      JSON.stringify(runtimeLoginRoleSets),
    ],
  );
  if (scopedMemberships.rows[0]?.safe !== true) {
    const runtimeScope =
      runtimeLoginRoleSets.length === 1 && runtimeRoles.length === 2
        ? `both ${applicationName} runtime roles`
        : `one configured ${applicationName} runtime role set`;
    throw new Error(
      `Runtime and backup login memberships must grant exactly SET access to ${runtimeScope} or to the separate backup role, without inheritance or administration; backup membership must remain separate.`,
    );
  }
  const sessionCapabilities = await client.query<{ safe: boolean }>(
    `SELECT current_setting('lo_compat_privileges') = 'off'
      AND current_setting('session_replication_role') = 'origin' AND NOT EXISTS (
      SELECT 1 FROM pg_roles identity
      CROSS JOIN unnest(ARRAY['lo_compat_privileges', 'session_replication_role']) parameter
      WHERE (identity.rolname = ANY($1::text[]) OR identity.rolname = ANY($2::text[]))
        AND has_parameter_privilege(identity.oid, parameter, 'SET')
    ) AS safe`,
    [restrictedLogins, [...runtimeRoles, ...optionalRoles]],
  );
  if (sessionCapabilities.rows[0]?.safe !== true) {
    throw new Error(
      `${applicationName} runtime and backup identities must not have SET on lo_compat_privileges or session_replication_role; migration requires lo_compat_privileges off and session_replication_role origin.`,
    );
  }
  // Revoking SET does not remove ALTER ROLE/ALTER DATABASE defaults. New
  // sessions still apply those values before the runtime pool assumes its role.
  // Refuse every applicable unsafe default, including one currently shadowed
  // by another setting: removing the override must not re-enable a bypass.
  const persistedCapabilities = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_db_role_setting setting CROSS JOIN unnest(setting.setconfig) config
      WHERE setting.setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
        AND (setting.setrole = 0 OR setting.setrole IN (
          SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[]) OR rolname = ANY($2::text[])
        ))
        AND CASE split_part(config, '=', 1)
          WHEN 'lo_compat_privileges' THEN split_part(config, '=', 2)::boolean
          WHEN 'session_replication_role' THEN split_part(config, '=', 2) <> 'origin'
          ELSE false END
    ) AS present`,
    [restrictedLogins, [...runtimeRoles, ...optionalRoles]],
  );
  if (persistedCapabilities.rows[0]?.present !== false) {
    throw new Error(
      `${applicationName} refuses persisted lo_compat_privileges or session_replication_role defaults that bypass large-object permissions or domain triggers. Reset the applicable database and role defaults before migration.`,
    );
  }
  // Creation functions otherwise grant ownership of new persistent objects
  // even with no table writes and an empty object inventory. File import/export
  // routines are privileged too; their default refusal must survive ACL drift.
  const largeObjectCreation = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_roles identity CROSS JOIN unnest($3::regprocedure[]) routine
      WHERE (identity.rolname = ANY($1::text[]) OR identity.rolname = ANY($2::text[]))
        AND has_function_privilege(identity.oid, routine, 'EXECUTE')
    ) AS present`,
    [
      restrictedLogins,
      [...runtimeRoles, ...optionalRoles],
      RESTRICTED_LARGE_OBJECT_FUNCTIONS,
    ],
  );
  if (largeObjectCreation.rows[0]?.present !== false) {
    throw new Error(
      `${applicationName} runtime and backup identities must not execute large-object creation or server-file import/export functions. Have the database administrator revoke their PUBLIC and restricted-role EXECUTE grants before migration.`,
    );
  }
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
  const loginAccess = await client.query<{
    safe: boolean;
  }>(
    `WITH logins AS (
      SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[])
    ), identities AS (
      SELECT oid, rolname FROM pg_roles WHERE rolname = ANY($1::text[]) OR rolname = ANY($2::text[])
    ), namespaces AS (
      SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    ) SELECT NOT EXISTS (
      SELECT 1 FROM identities login WHERE
        has_database_privilege(login.oid, current_database(), 'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION,TEMPORARY WITH GRANT OPTION')
        OR EXISTS (
          SELECT 1 FROM pg_shdepend dependency
          WHERE dependency.refclassid = 'pg_authid'::regclass AND dependency.refobjid = login.oid
            AND dependency.deptype = 'o'
            AND dependency.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
        )
        OR EXISTS (
          SELECT 1 FROM namespaces WHERE has_schema_privilege(login.oid, oid, 'CREATE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_proc routine WHERE routine.pronamespace IN (SELECT oid FROM namespaces)
            AND routine.prosecdef AND has_function_privilege(login.oid, routine.oid, 'EXECUTE')
        )
        OR EXISTS (
          SELECT 1 FROM pg_largeobject_metadata object WHERE
            has_largeobject_privilege(login.oid, object.oid, 'UPDATE')
            OR (login.rolname IS DISTINCT FROM $3 AND has_largeobject_privilege(login.oid, object.oid, 'SELECT'))
        )
        OR EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('v', 'm', 'f') THEN (
              has_table_privilege(login.oid, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              OR has_any_column_privilege(login.oid, object.oid, 'INSERT,UPDATE,REFERENCES')
              OR (login.rolname IS DISTINCT FROM $3 AND (
                has_table_privilege(login.oid, object.oid, 'SELECT')
                OR has_any_column_privilege(login.oid, object.oid, 'SELECT')
              ))
            ) ELSE false END
        )
        OR EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p') THEN (
              has_table_privilege(login.oid, object.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              OR has_any_column_privilege(login.oid, object.oid, 'REFERENCES')
            ) ELSE false END
        )
        OR EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind = 'S'
              THEN has_sequence_privilege(login.oid, object.oid, 'UPDATE')
              ELSE false END
        )
        OR (login.rolname = $3 AND EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p') THEN (
                has_table_privilege(login.oid, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                OR has_any_column_privilege(login.oid, object.oid, 'INSERT,UPDATE,REFERENCES')
              ) WHEN object.relkind = 'S'
                THEN has_sequence_privilege(login.oid, object.oid, 'USAGE,UPDATE')
              ELSE false END
        ))
    ) AND NOT EXISTS (
      SELECT 1 FROM logins login WHERE EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN (
              has_table_privilege(login.oid, object.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              OR has_any_column_privilege(login.oid, object.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            ) ELSE false END
        )
        OR EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind = 'S'
              THEN has_sequence_privilege(login.oid, object.oid, 'SELECT,USAGE,UPDATE')
              ELSE false END
        )
    ) AS safe`,
    [restrictedLogins, [...runtimeRoles, ...optionalRoles], backupRole ?? null],
  );
  if (loginAccess.rows[0]?.safe !== true) {
    throw new Error(
      `Runtime and backup identities must own no database objects and hold no access outside their reviewed ${applicationName} roles: remove direct or PUBLIC login data grants, CREATE, TEMPORARY, CONNECT grant options, executable SECURITY DEFINER routines, view, materialized view, foreign table, or large object access beyond read-only backup grants, backup table writes, or sequence UPDATE privileges.`,
    );
  }
  try {
    await assertSafePostgresCatalogPrivileges(client, [
      ...runtimeRoles,
      ...optionalRoles,
      ...restrictedLogins,
    ]);
  } catch {
    throw new Error(
      `${applicationName} runtime and backup identities have unsafe PostgreSQL catalog privileges.`,
    );
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
