import type pg from 'pg';

import { assertSafePostgresCatalogPrivileges } from '@codaco/studio-sync/postgres-catalog-privileges';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';
import {
  runtimeRolesSql,
  RESTRICTED_LARGE_OBJECT_FUNCTIONS,
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
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_roles login WHERE login.rolname = ANY($1::text[])
        AND NOT (
          NOT EXISTS (
            SELECT 1 FROM unnest($4::text[]) required_role
            WHERE NOT EXISTS (
              SELECT 1 FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid
              WHERE membership.member = login.oid AND parent.rolname = required_role
            )
          ) OR EXISTS (
            SELECT 1 FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid
            WHERE membership.member = login.oid AND parent.rolname = $3
          )
        )
    ) AS safe`,
    [
      restrictedLogins,
      [...Object.values(TENANT_ROLES), BACKUP_ROLE],
      BACKUP_ROLE,
      Object.values(TENANT_ROLES),
    ],
  );
  if (scopedMemberships.rows[0]?.safe !== true) {
    throw new Error(
      'Runtime and backup login memberships must grant exactly SET access to both Studio runtime roles or to the separate backup role, without inheritance or administration; backup membership must remain separate.',
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
    [restrictedLogins, [...Object.values(TENANT_ROLES), BACKUP_ROLE]],
  );
  if (sessionCapabilities.rows[0]?.safe !== true) {
    throw new Error(
      'Studio runtime and backup identities must not have SET on lo_compat_privileges or session_replication_role; migration requires lo_compat_privileges off and session_replication_role origin.',
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
    [restrictedLogins, [...Object.values(TENANT_ROLES), BACKUP_ROLE]],
  );
  if (persistedCapabilities.rows[0]?.present !== false) {
    throw new Error(
      'Studio refuses persisted lo_compat_privileges or session_replication_role defaults that bypass large-object permissions or domain triggers. Reset the applicable database and role defaults before migration.',
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
      [...Object.values(TENANT_ROLES), BACKUP_ROLE],
      RESTRICTED_LARGE_OBJECT_FUNCTIONS,
    ],
  );
  if (largeObjectCreation.rows[0]?.present !== false) {
    throw new Error(
      'Studio runtime and backup identities must not execute large-object creation or server-file import/export functions. Have the database administrator revoke their PUBLIC and restricted-role EXECUTE grants before migration.',
    );
  }
  // Studio supports invoker triggers only. A definer trigger can run without
  // EXECUTE and can be reached through a foreign-key cascade even when the
  // runtime has no direct access to its table. Disabled triggers are included:
  // their presence cannot establish that the existing evidence was protected.
  const definerTriggers = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_trigger trigger
      JOIN pg_proc routine ON routine.oid = trigger.tgfoid
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE routine.prosecdef AND namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
    ) AS present`,
  );
  if (definerTriggers.rows[0]?.present !== false) {
    throw new Error(
      'Studio does not support SECURITY DEFINER triggers on application database relations. Their presence makes existing migration evidence untrusted; restore a verified backup before migrating.',
    );
  }
  // Non-SELECT rewrite actions run with the relation owner's privileges,
  // including when the caller has no direct grant on the affected evidence.
  // Disabled rules are included for the same provenance reason as triggers.
  const rewriteRules = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_rewrite rule JOIN pg_class relation ON relation.oid = rule.ev_class
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE rule.ev_type <> '1' AND namespace.nspname !~ '^pg_'
        AND namespace.nspname <> 'information_schema'
    ) AS present`,
  );
  if (rewriteRules.rows[0]?.present !== false) {
    throw new Error(
      'Studio does not support owner-backed rewrite rules on application database relations. Their presence makes existing migration evidence untrusted; restore a verified backup before migrating.',
    );
  }
  // Evidence is authored as standalone ordinary tables. Inheritance and
  // partition routing authorize against a parent, bypassing these tables' own
  // ACLs; inherited children also contribute rows to ordinary evidence reads.
  // Reject either direction before the runner trusts any recorded history.
  const evidenceShape = await client.query<{ safe: boolean }>(
    `SELECT NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class evidence
      WHERE evidence.oid IN (pg_catalog.to_regclass($1), pg_catalog.to_regclass($2))
        AND (evidence.relkind <> 'r' OR evidence.relispartition OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_inherits inheritance
          WHERE inheritance.inhrelid = evidence.oid OR inheritance.inhparent = evidence.oid
        ))
    ) AS safe`,
    ['studio_migrations.history', 'public."schemaFingerprint"'],
  );
  if (evidenceShape.rows[0]?.safe !== true) {
    throw new Error(
      'Studio migration evidence must be standalone ordinary tables without inheritance or partitions. Existing evidence is untrusted; restore a verified backup before migrating.',
    );
  }
  const loginAccess = await client.query<{
    safe: boolean;
    evidence_safe: boolean;
  }>(
    `WITH logins AS (
      SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[])
    ), identities AS (
      SELECT oid, rolname FROM pg_roles WHERE rolname = ANY($1::text[]) OR rolname = ANY($2::text[])
    ), namespaces AS (
      SELECT oid FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    ) SELECT NOT EXISTS (
      SELECT 1 FROM identities login WHERE
        has_database_privilege(login.oid, current_database(), 'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION')
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
            OR (login.rolname <> $3 AND has_largeobject_privilege(login.oid, object.oid, 'SELECT'))
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
    ) AS safe, NOT EXISTS (
      SELECT 1 FROM identities login CROSS JOIN pg_class object
      WHERE object.oid IN (to_regclass($4), to_regclass($5))
        AND CASE WHEN object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN (
          has_table_privilege(login.oid, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(login.oid, object.oid, 'INSERT,UPDATE,REFERENCES')
        ) ELSE false END
    ) AS evidence_safe`,
    [
      restrictedLogins,
      [...Object.values(TENANT_ROLES), BACKUP_ROLE],
      BACKUP_ROLE,
      'studio_migrations.history',
      'public."schemaFingerprint"',
    ],
  );
  if (loginAccess.rows[0]?.evidence_safe !== true) {
    throw new Error(
      'Runtime and backup identities have access outside their reviewed Studio roles: existing migration evidence is writable and cannot be trusted. Restore a verified backup before migrating.',
    );
  }
  if (!loginAccess.rows[0].safe) {
    throw new Error(
      'Runtime and backup identities must own no database objects and hold no access outside their reviewed Studio roles: remove direct or PUBLIC login data grants, CREATE or TEMPORARY, CONNECT grant options, executable SECURITY DEFINER routines, view, materialized view, foreign table, or large object access beyond read-only backup grants, backup table writes, or sequence UPDATE privileges.',
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
  // This remains inside the repeatable preflight/finalizer, before the caller
  // trusts history or fingerprints. Include session identities: SET ROLE NONE
  // restores their direct privileges independently of the pinned runtime role.
  try {
    await assertSafePostgresCatalogPrivileges(client, [
      ...scopedRoles,
      ...restrictedLogins,
    ]);
  } catch {
    throw new Error(
      'Runtime and backup identities have unsupported PostgreSQL catalog capabilities or the catalog could not be verified. Ask the database administrator to investigate reserved namespace and catalog grants before migrating.',
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
    ) AS present
  `);
  if (sessions.rows[0]?.present !== false) {
    throw new Error(
      'Studio has existing runtime connections. Keep admission closed and stop all web, worker and backup processes before applying pending migrations.',
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
