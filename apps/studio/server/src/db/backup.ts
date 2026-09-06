import type pg from 'pg';

import { BACKUP_ROLE } from '@codaco/studio-sync/rls';

import { SCHEMA_TABLES } from './schema.ts';

/**
 * pg_dump --enable-row-security otherwise succeeds while silently omitting
 * inaccessible rows. Require the explicit, unrestricted SELECT policy on
 * every RLS table, including tables newer than this binary's known inventory.
 * Run this with the separately held backup login immediately before dumping.
 */
export async function assertBackupAccess(
  pool: Pick<pg.Pool, 'query'>,
): Promise<void> {
  const identity = await pool.query<{ safe: boolean }>(
    `
    SELECT current_user = $1
      AND EXISTS (
        SELECT 1 FROM pg_roles role WHERE role.rolname = current_user
          AND NOT (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication)
          AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = role.oid)
      )
      AND EXISTS (
        SELECT 1 FROM pg_roles login WHERE login.rolname = session_user
          AND rolcanlogin AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)
          AND NOT EXISTS (
            SELECT 1 FROM pg_auth_members membership JOIN pg_roles parent ON parent.oid = membership.roleid
            WHERE membership.member = login.oid AND (parent.rolname <> $1 OR membership.admin_option OR membership.inherit_option OR NOT membership.set_option)
          )
      ) AS safe`,
    [BACKUP_ROLE],
  );
  if (identity.rows[0]?.safe !== true)
    throw new Error('STUDIO_BACKUP_ACCESS_UNSAFE');
  const result = await pool.query<{ safe: boolean }>(
    `
    -- This parameter bypasses large-object ACLs. Refuse the capability even
    -- with no existing objects, and refuse a permissive live session after a
    -- formerly granted SET privilege has been revoked.
    SELECT current_setting('lo_compat_privileges') = 'off'
      AND NOT has_parameter_privilege(current_user, 'lo_compat_privileges', 'SET')
      AND NOT has_parameter_privilege(session_user, 'lo_compat_privileges', 'SET')
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
      AND NOT has_database_privilege(session_user, current_database(), 'CREATE')
      -- RESET ROLE/SET ROLE NONE must not expose login-owned objects or writes.
      AND NOT EXISTS (
        SELECT 1 FROM pg_namespace WHERE (nspname NOT IN ('pg_catalog', 'information_schema') AND (
            has_schema_privilege(current_user, oid, 'CREATE')
            OR has_schema_privilege(session_user, oid, 'CREATE')
          ))
      )
      AND NOT EXISTS (
        -- Match migration preflight's complete ownership inventory. Tables,
        -- types, functions, foreign servers and shared objects all appear here.
        SELECT 1 FROM pg_shdepend dependency
        WHERE dependency.refclassid = 'pg_authid'::regclass
          AND dependency.refobjid IN (SELECT oid FROM pg_roles WHERE rolname IN (current_user, session_user))
          AND dependency.deptype = 'o'
          AND dependency.dbid IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc routine JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND routine.prosecdef AND (
            has_function_privilege(current_user, routine.oid, 'EXECUTE')
            OR has_function_privilege(session_user, routine.oid, 'EXECUTE')
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest($1::text[]) name WHERE to_regclass(name) IS NULL
      )
      AND NOT EXISTS (
        -- Large objects have their own ACL catalog and no table/schema entry.
        -- Require complete reads for pg_dump while refusing writes through
        -- either the active backup role or SET ROLE NONE's login identity.
        SELECT 1 FROM pg_largeobject_metadata object WHERE
          NOT has_largeobject_privilege(current_user, object.oid, 'SELECT')
          OR has_largeobject_privilege(current_user, object.oid, 'UPDATE')
          OR has_largeobject_privilege(session_user, object.oid, 'UPDATE')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_class object JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
        -- Updatable views can write owner-backed rows without base-table grants.
        -- Materialized views and foreign tables also carry table privileges.
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema') AND CASE WHEN object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN (
          (namespace.nspname IN ('public', 'studio_migrations') AND NOT has_table_privilege(current_user, object.oid, 'SELECT'))
          OR has_table_privilege(current_user, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(current_user, object.oid, 'INSERT,UPDATE,REFERENCES')
          OR has_table_privilege(session_user, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(session_user, object.oid, 'INSERT,UPDATE,REFERENCES')
          OR (object.relrowsecurity AND (
            NOT EXISTS (
              SELECT 1 FROM pg_policy policy WHERE policy.polrelid = object.oid
                AND policy.polname = 'backup_read' AND policy.polcmd = 'r' AND policy.polpermissive
                AND policy.polroles = ARRAY[0::oid]
                AND pg_get_expr(policy.polqual, policy.polrelid) = $2
            )
            OR EXISTS (
              SELECT 1 FROM pg_policy policy WHERE policy.polrelid = object.oid
                AND NOT policy.polpermissive AND policy.polcmd IN ('r', '*')
                AND (0::oid = ANY(policy.polroles) OR (SELECT oid FROM pg_roles WHERE rolname = current_user) = ANY(policy.polroles))
            )
          ))
        ) ELSE false END
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_class object JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
        -- SQL AND does not guarantee evaluation order: this function refuses
        -- non-sequences, so its type guard must be an explicit CASE.
        WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema') AND CASE WHEN object.relkind = 'S' THEN (
          (namespace.nspname IN ('public', 'studio_migrations') AND NOT has_sequence_privilege(current_user, object.oid, 'SELECT'))
          OR has_sequence_privilege(current_user, object.oid, 'USAGE,UPDATE')
          OR has_sequence_privilege(session_user, object.oid, 'USAGE,UPDATE')
        ) ELSE false END
      ) AS safe`,
    [
      [
        ...SCHEMA_TABLES.map((name) => `public."${name}"`),
        'public."schemaFingerprint"',
        'studio_migrations.history',
      ],
      `(CURRENT_USER = '${BACKUP_ROLE}'::name)`,
    ],
  );
  if (result.rows[0]?.safe !== true)
    throw new Error('STUDIO_BACKUP_ACCESS_UNSAFE');
}
