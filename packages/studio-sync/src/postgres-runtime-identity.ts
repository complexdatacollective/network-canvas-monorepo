import type pg from 'pg';

import { assertSafePostgresCatalogPrivileges } from './postgres-catalog-privileges.ts';
import { assertSafePostgresDatabaseEnrollment } from './postgres-database-enrollment.ts';
import {
  RESTRICTED_LARGE_OBJECT_FUNCTIONS,
  validateRoleNames,
} from './role-bootstrap.ts';

export type PostgresRuntimeIdentity = Readonly<{
  intendedRole: string;
  allowedRoles: readonly string[];
  allowedLogins: readonly string[];
}>;

/** Verify the real LOGIN as well as the pool's pinned role before runtime
 * admission. SET ROLE NONE restores session_user, so role pinning alone cannot
 * make an owner/admin URL safe. Domain callers supply their exact SET-only role
 * set; offline administrative pools deliberately do not call this verifier.
 * The caller owns the connection/transaction. No grants or settings are changed.
 * Provisioning still owns object definitions and each role's domain/RLS policy.
 * PostgreSQL 18 only, matching the shared catalog baseline. */
export async function assertSafePostgresRuntimeIdentity(
  client: pg.PoolClient,
  configuration: PostgresRuntimeIdentity,
): Promise<void> {
  let roles: string[];
  let intendedRole: string;
  let logins: string[];
  try {
    const candidateRole: unknown = configuration.intendedRole;
    const candidateRoles: unknown = configuration.allowedRoles;
    const candidateLogins: unknown = configuration.allowedLogins;
    if (!Array.isArray(candidateLogins)) throw new Error();
    const copiedLogins: unknown[] = [...candidateLogins];
    if (
      !copiedLogins.every((login): login is string => typeof login === 'string')
    )
      throw new Error();
    validateRoleNames(copiedLogins);
    logins = copiedLogins;
    if (!Array.isArray(candidateRoles)) throw new Error();
    const copied: unknown[] = [...candidateRoles];
    if (!copied.every((role): role is string => typeof role === 'string')) {
      throw new Error();
    }
    validateRoleNames(copied);
    if (typeof candidateRole !== 'string' || !copied.includes(candidateRole)) {
      throw new Error();
    }
    roles = copied;
    intendedRole = candidateRole;
  } catch {
    throw new Error('POSTGRES_RUNTIME_IDENTITY_INVALID');
  }

  try {
    await assertSafePostgresDatabaseEnrollment(client, logins);
    const result = await client.query<{ safe: boolean; session_name: string }>(
      `WITH database AS MATERIALIZED (
        SELECT oid, datdba, datacl FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()
      ), login AS MATERIALIZED (
        SELECT * FROM pg_catalog.pg_roles WHERE rolname = session_user
      ), scoped AS MATERIALIZED (
        SELECT * FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])
      ), identities AS MATERIALIZED (
        SELECT oid FROM login UNION SELECT oid FROM scoped
      ), namespaces AS MATERIALIZED (
        SELECT oid FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
      ), access AS MATERIALIZED (
        SELECT privilege.* FROM database,
          pg_catalog.aclexplode(COALESCE(database.datacl, pg_catalog.acldefault('d', database.datdba))) privilege
        WHERE privilege.privilege_type = 'CONNECT'
      ) SELECT session_user AS session_name,
        current_user = $2::pg_catalog.text AND session_user <> ALL($1::pg_catalog.text[])
        AND session_user = ANY($4::pg_catalog.text[])
        AND (SELECT count(*) FROM scoped) = pg_catalog.cardinality($1::pg_catalog.text[])
        AND EXISTS (SELECT 1 FROM login WHERE rolcanlogin AND NOT (
          rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit))
        AND NOT EXISTS (SELECT 1 FROM scoped WHERE rolcanlogin OR rolsuper OR rolbypassrls
          OR rolcreaterole OR rolcreatedb OR rolreplication)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership
          WHERE membership.member IN (SELECT oid FROM scoped))
        -- An outsider granted this LOGIN inherits its direct CONNECT and can
        -- follow the LOGIN's SET chain without entering the verified pool.
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership
          JOIN pg_catalog.pg_roles member ON member.oid = membership.member
          WHERE membership.roleid IN (SELECT oid FROM login)
            AND NOT member.rolsuper
            AND member.oid NOT IN (SELECT oid FROM login))
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership
          WHERE membership.member IN (SELECT oid FROM login)
            AND (membership.roleid NOT IN (SELECT oid FROM scoped)
              OR membership.admin_option OR membership.inherit_option OR NOT membership.set_option))
        AND NOT EXISTS (SELECT 1 FROM scoped WHERE NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_auth_members membership
          WHERE membership.member IN (SELECT oid FROM login) AND membership.roleid = scoped.oid))
        AND EXISTS (SELECT 1 FROM access WHERE grantee IN (SELECT oid FROM login) AND NOT is_grantable)
        AND NOT EXISTS (SELECT 1 FROM access WHERE grantee = 0 OR grantee IN (SELECT oid FROM scoped))
        AND NOT EXISTS (SELECT 1 FROM identities identity WHERE
          pg_catalog.has_database_privilege(identity.oid, pg_catalog.current_database(), 'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION')
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend dependency
            WHERE dependency.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass
              AND dependency.refobjid = identity.oid AND dependency.deptype = 'o'
              AND dependency.dbid IN (0, (SELECT oid FROM database)))
          OR EXISTS (SELECT 1 FROM namespaces namespace WHERE
            pg_catalog.has_schema_privilege(identity.oid, namespace.oid, 'CREATE,USAGE WITH GRANT OPTION'))
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc routine WHERE routine.pronamespace IN (SELECT oid FROM namespaces)
            AND ((routine.prosecdef AND pg_catalog.has_function_privilege(identity.oid, routine.oid, 'EXECUTE'))
              OR pg_catalog.has_function_privilege(identity.oid, routine.oid, 'EXECUTE WITH GRANT OPTION')))
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_largeobject_metadata object WHERE
            pg_catalog.has_largeobject_privilege(identity.oid, object.oid, 'SELECT,UPDATE'))
          OR EXISTS (SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
              pg_catalog.has_table_privilege(identity.oid, object.oid,
                'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
              OR pg_catalog.has_any_column_privilege(identity.oid, object.oid,
                'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
            WHEN object.relkind = 'S' THEN pg_catalog.has_sequence_privilege(identity.oid, object.oid,
              'UPDATE,SELECT WITH GRANT OPTION,USAGE WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
            ELSE false END)
        )
        AND NOT EXISTS (SELECT 1 FROM login CROSS JOIN pg_catalog.pg_class object
          WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
              pg_catalog.has_table_privilege(login.oid, object.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              OR pg_catalog.has_any_column_privilege(login.oid, object.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            WHEN object.relkind = 'S' THEN pg_catalog.has_sequence_privilege(login.oid, object.oid, 'SELECT,USAGE,UPDATE')
            ELSE false END)
        AND pg_catalog.current_setting('lo_compat_privileges') = 'off'
        AND pg_catalog.current_setting('session_replication_role') = 'origin'
        AND NOT EXISTS (SELECT 1 FROM identities identity
          CROSS JOIN unnest(ARRAY['lo_compat_privileges', 'session_replication_role']) parameter
          WHERE pg_catalog.has_parameter_privilege(identity.oid, parameter, 'SET'))
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting setting
          CROSS JOIN unnest(setting.setconfig) config
          WHERE setting.setdatabase IN (0, (SELECT oid FROM database))
            AND (setting.setrole = 0 OR setting.setrole IN (SELECT oid FROM identities))
            AND CASE pg_catalog.split_part(config, '=', 1)
              WHEN 'lo_compat_privileges' THEN pg_catalog.split_part(config, '=', 2)::boolean
              WHEN 'session_replication_role' THEN pg_catalog.split_part(config, '=', 2) <> 'origin'
              ELSE false END)
        AND NOT EXISTS (SELECT 1 FROM identities identity CROSS JOIN unnest($3::pg_catalog.regprocedure[]) routine
          WHERE pg_catalog.has_function_privilege(identity.oid, routine, 'EXECUTE')) AS safe`,
      [roles, intendedRole, RESTRICTED_LARGE_OBJECT_FUNCTIONS, logins],
    );
    const identity = result.rows[0];
    if (identity?.safe !== true) throw new Error();
    await assertSafePostgresCatalogPrivileges(client, [
      ...roles,
      identity.session_name,
    ]);
  } catch {
    // Never propagate SQL, identifiers, connection configuration or raw causes.
    throw new Error('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
  }
}
