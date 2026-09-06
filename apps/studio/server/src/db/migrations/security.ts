import type pg from 'pg';

import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import {
  runtimeRolesSql,
  validateRoleNames,
} from '@codaco/studio-sync/role-bootstrap';

/** Enforce deployment access before SQL and again after historical grants. */
export async function enforceMigrationSecurity(
  client: pg.PoolClient,
  allowedLogins: readonly string[],
): Promise<void> {
  validateRoleNames(allowedLogins);
  // Backup identity provisioning belongs to its own versioned sidecar. Check
  // it when present without creating a future role on an older installation.
  const optionalRoles = await client.query<{ rolname: string }>(
    'SELECT rolname FROM pg_roles WHERE rolname = $1',
    [BACKUP_ROLE],
  );
  await client.query(
    runtimeRolesSql([
      ...Object.values(TENANT_ROLES),
      ...optionalRoles.rows.map(({ rolname }) => rolname),
    ]),
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
      'Enrolled Studio identities must exist and allow LOGIN; runtime and backup logins must be NOINHERIT and lack database administration or replication attributes.',
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
      'Enrolled Studio logins must not have memberships granted to unenrolled roles.',
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
    ) AS safe`,
    [
      restrictedLogins,
      [...Object.values(TENANT_ROLES), BACKUP_ROLE],
      BACKUP_ROLE,
    ],
  );
  if (scopedMemberships.rows[0]?.safe !== true) {
    throw new Error(
      'Runtime and backup login memberships must grant only SET access to the reviewed Studio roles, without inheritance or administration; backup membership must be separate from runtime membership.',
    );
  }
  const loginAccess = await client.query<{ safe: boolean }>(
    `WITH logins AS (
      SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[])
    ), identities AS (
      SELECT oid, rolname FROM pg_roles WHERE rolname = ANY($1::text[]) OR rolname = ANY($2::text[])
    ), namespaces AS (
      SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    ) SELECT NOT EXISTS (
      SELECT 1 FROM identities login WHERE
        has_database_privilege(login.oid, current_database(), 'CREATE,CONNECT WITH GRANT OPTION,TEMPORARY WITH GRANT OPTION')
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
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('v', 'm', 'f') THEN (
              has_table_privilege(login.oid, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              OR has_any_column_privilege(login.oid, object.oid, 'INSERT,UPDATE,REFERENCES')
              OR (login.rolname <> $3 AND (
                has_table_privilege(login.oid, object.oid, 'SELECT')
                OR has_any_column_privilege(login.oid, object.oid, 'SELECT')
              ))
            ) ELSE false END
        )
        OR (login.rolname = $3 AND EXISTS (
          SELECT 1 FROM pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p')
              AND object.oid IS DISTINCT FROM to_regclass($4)
              AND object.oid IS DISTINCT FROM to_regclass($5) THEN (
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
    [
      restrictedLogins,
      [...Object.values(TENANT_ROLES), BACKUP_ROLE],
      BACKUP_ROLE,
      'studio_migrations.history',
      'public."schemaFingerprint"',
    ],
  );
  if (loginAccess.rows[0]?.safe !== true) {
    throw new Error(
      'Runtime and backup identities must own no database objects and hold no access outside their reviewed Studio roles: remove direct or PUBLIC login data grants, CREATE, CONNECT grant options, executable SECURITY DEFINER routines, view, materialized view, or foreign table access beyond read-only backup grants, and backup table or sequence writes.',
    );
  }
  // CONNECT is checked only at connection admission. Enrollment must already
  // be committed while database admission is quarantined; changing it inside
  // this transaction would leave old or racing outside sessions connected.
  const enrollment = await client.query<{ valid: boolean }>(
    `WITH access AS (
      SELECT acl.grantee, acl.privilege_type FROM pg_database database,
        aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) acl
      WHERE database.datname = current_database() AND acl.privilege_type = 'CONNECT'
    ) SELECT
      NOT EXISTS (
        SELECT 1 FROM access LEFT JOIN pg_roles grantee ON grantee.oid = access.grantee
        WHERE access.grantee = 0 OR (NOT grantee.rolsuper AND NOT grantee.rolname = ANY($1::text[]))
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_roles enrolled WHERE enrolled.rolname = ANY($1::text[])
          AND NOT EXISTS (SELECT 1 FROM access WHERE grantee = enrolled.oid)
      ) AS valid`,
    [allowedLogins],
  );
  if (!enrollment.rows[0]?.valid) {
    throw new Error(
      'Studio database CONNECT must match the precommitted enrollment. Quarantine database admission, remove unenrolled grants, and explicitly grant CONNECT to every STUDIO_DATABASE_ALLOWED_LOGINS entry before migrating.',
    );
  }
  const outsiders = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolcanlogin AND NOT rolsuper
      AND NOT rolname = ANY($1::text[])
      AND has_database_privilege(oid, current_database(), 'CONNECT')
  ) AS present`,
    [allowedLogins],
  );
  if (outsiders.rows[0]?.present) {
    throw new Error(
      'Studio database CONNECT is available to an unenrolled login. Ask the administrator to remove its direct or inherited grant before migrating.',
    );
  }
  // PostgreSQL caches activity snapshots for a transaction. The final check
  // must see connections admitted after the initial check.
  await client.query('SELECT pg_stat_clear_snapshot()');
  const sessions = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
    SELECT 1 FROM pg_stat_activity activity JOIN pg_roles login ON login.oid = activity.usesysid
    WHERE activity.datname = current_database() AND NOT login.rolsuper
      AND NOT login.rolname = ANY($1::text[])
  ) AS present`,
    [allowedLogins],
  );
  if (sessions.rows[0]?.present) {
    throw new Error(
      'Studio has existing connections from unenrolled logins. Quarantine database admission and have the administrator remove those sessions before migrating.',
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
