import { escapeIdentifier } from 'pg';
import type pg from 'pg';

import { assertSafePostgresCatalogPrivileges } from './postgres-catalog-privileges.ts';
import {
  RESTRICTED_LARGE_OBJECT_FUNCTIONS,
  validateRoleNames,
} from './role-bootstrap.ts';

const BACKUP_VERIFICATION_TIMEOUT_MS = 10_000;

export type PostgresBackupConfiguration = {
  readonly role: string;
  /** Require complete SELECT on all current and future relations here. */
  readonly completeSchemas: readonly string[];
  /** Refuse missing tables instead of silently producing a partial dump. */
  readonly expectedTables: readonly { schema: string; name: string }[];
  readonly rowSecurity:
    | { readonly mode: 'forbid' }
    | {
        readonly mode: 'policy';
        readonly name: string;
        /** Exact pg_get_expr output of the caller's unrestricted SELECT policy. */
        readonly expression: string;
      };
  readonly failureCode: string;
};

/** pg_dump can succeed with missing rows. Verify complete reads and a strictly
 * read-only role/login immediately before capture, using one shared scanner. */
export function createPostgresBackupVerifier(
  input: PostgresBackupConfiguration,
) {
  const { role, failureCode } = input;
  try {
    validateRoleNames([role]);
    validateRoleNames(input.completeSchemas);
    if (
      !/^[A-Z][A-Z0-9_]{0,127}$/.test(failureCode) ||
      input.expectedTables.length === 0
    )
      throw new Error('Invalid backup configuration');
    for (const table of input.expectedTables) {
      validateRoleNames([table.schema]);
      validateRoleNames([table.name]);
      if (!input.completeSchemas.includes(table.schema))
        throw new Error('Incomplete backup schema inventory');
    }
    const names = input.expectedTables.map(({ schema, name }) =>
      JSON.stringify([schema, name]),
    );
    if (new Set(names).size !== names.length)
      throw new Error('Repeated backup table');
    if (input.rowSecurity.mode === 'policy') {
      validateRoleNames([input.rowSecurity.name]);
      const expression = input.rowSecurity.expression;
      if (
        !expression.trim() ||
        expression.length > 8192 ||
        !expression.isWellFormed() ||
        expression.includes('\0')
      )
        throw new Error('Invalid backup policy expression');
    } else if (input.rowSecurity.mode !== 'forbid') {
      throw new Error('Invalid backup row security mode');
    }
  } catch {
    throw new Error(
      'Supply complete PostgreSQL backup verification configuration.',
    );
  }
  // Snapshot every mutable caller value before the first asynchronous query.
  const completeSchemas = [...input.completeSchemas];
  const expectedRelations = input.expectedTables.map(
    ({ schema, name }) =>
      `${escapeIdentifier(schema)}.${escapeIdentifier(name)}`,
  );
  const forbidRls = input.rowSecurity.mode === 'forbid';
  const policyName =
    input.rowSecurity.mode === 'policy' ? input.rowSecurity.name : '';
  const policyExpression =
    input.rowSecurity.mode === 'policy' ? input.rowSecurity.expression : '';
  async function assertConnection(client: pg.PoolClient): Promise<void> {
    const identity = await client.query<{
      safe: boolean;
      current: string;
      session: string;
    }>(
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
      ) AS safe, current_user AS current, session_user AS session`,
      [role],
    );
    if (identity.rows[0]?.safe !== true) throw new Error(failureCode);
    const result = await client.query<{ safe: boolean }>(
      `
    -- Refuse bypass capabilities even with no existing objects, and refuse
    -- permissive live sessions after formerly granted SET was revoked.
    SELECT current_setting('lo_compat_privileges') = 'off'
      AND current_setting('session_replication_role') = 'origin'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(ARRAY['lo_compat_privileges', 'session_replication_role']) parameter
        WHERE has_parameter_privilege(current_user, parameter, 'SET')
          OR has_parameter_privilege(session_user, parameter, 'SET')
      )
      AND NOT EXISTS (
        -- A pooled verifier can be safe while a new pg_dump session inherits
        -- unsafe defaults. Include shadowed settings and both identities.
        SELECT 1 FROM pg_db_role_setting setting CROSS JOIN unnest(setting.setconfig) config
        WHERE setting.setdatabase IN (0, (SELECT oid FROM pg_database WHERE datname = current_database()))
          AND (setting.setrole = 0 OR setting.setrole IN (
            SELECT oid FROM pg_roles WHERE rolname IN (current_user, session_user)
          ))
          AND CASE split_part(config, '=', 1)
            WHEN 'lo_compat_privileges' THEN split_part(config, '=', 2)::boolean
            WHEN 'session_replication_role' THEN split_part(config, '=', 2) <> 'origin'
            ELSE false END
      )
      AND NOT EXISTS (
        -- Object ownership bypasses readonly ACLs; creation/import/export
        -- grants must be removed by the administrator in this database.
        SELECT 1 FROM unnest($6::regprocedure[]) routine
        WHERE has_function_privilege(current_user, routine, 'EXECUTE')
          OR has_function_privilege(session_user, routine, 'EXECUTE')
      )
      AND NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY')
      AND NOT has_database_privilege(session_user, current_database(), 'CREATE,TEMPORARY')
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
          (namespace.nspname = ANY($4::text[]) AND NOT has_table_privilege(current_user, object.oid, 'SELECT'))
          OR has_table_privilege(current_user, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(current_user, object.oid, 'INSERT,UPDATE,REFERENCES')
          OR has_table_privilege(session_user, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(session_user, object.oid, 'INSERT,UPDATE,REFERENCES')
          OR (object.relrowsecurity AND (
            $5::boolean OR NOT EXISTS (
              SELECT 1 FROM pg_policy policy WHERE policy.polrelid = object.oid
                AND policy.polname = $3 AND policy.polcmd = 'r' AND policy.polpermissive
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
          (namespace.nspname = ANY($4::text[]) AND NOT has_sequence_privilege(current_user, object.oid, 'SELECT'))
          OR has_sequence_privilege(current_user, object.oid, 'USAGE,UPDATE')
          OR has_sequence_privilege(session_user, object.oid, 'USAGE,UPDATE')
        ) ELSE false END
      ) AS safe`,
      [
        expectedRelations,
        policyExpression,
        policyName,
        completeSchemas,
        forbidRls,
        RESTRICTED_LARGE_OBJECT_FUNCTIONS,
      ],
    );
    if (result.rows[0]?.safe !== true) throw new Error(failureCode);
    await assertSafePostgresCatalogPrivileges(client, [
      identity.rows[0].current,
      identity.rows[0].session,
    ]);
  }

  return async function assertBackupAccess(
    connection: pg.Pool | pg.PoolClient,
  ): Promise<void> {
    // A checked-out client belongs to its caller, including transaction state.
    // Structural discrimination also supports clients from another pg copy.
    if ('release' in connection) {
      try {
        if (typeof connection.release !== 'function')
          throw new Error(failureCode);
        await assertConnection(connection);
      } catch {
        throw new Error(failureCode);
      }
      return;
    }

    let client: pg.PoolClient | undefined;
    let released = false;
    let expired = false;
    const interrupted = Promise.withResolvers<never>();
    const release = (destroy: boolean) => {
      if (!client || released) return;
      released = true;
      const borrowed = client;
      if (destroy) {
        // pg can emit a final socket error after its active query rejects.
        // Keep the fixed-error listener until disposal actually finishes.
        borrowed.once('end', () => borrowed.off('error', abort));
      } else {
        borrowed.off('error', abort);
      }
      borrowed.release(destroy);
    };
    const abort = () => {
      expired = true;
      try {
        release(true);
      } catch {
        // Neither a socket event nor deadline cleanup may expose provider errors.
      }
      interrupted.reject(new Error(failureCode));
    };
    const operation = async () => {
      let succeeded = false;
      try {
        client = await connection.connect();
        client.on('error', abort);
        // Acquisition can finish after our deadline. Never leak that borrower.
        if (expired) throw new Error(failureCode);
        await client.query('BEGIN READ ONLY');
        await assertConnection(client);
        await client.query('COMMIT');
        succeeded = true;
      } catch {
        if (client && !expired) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Every unsuccessful borrower is discarded, including rollback failure.
          }
        }
        throw new Error(failureCode);
      } finally {
        release(!succeeded);
      }
    };
    const timer = setTimeout(abort, BACKUP_VERIFICATION_TIMEOUT_MS);
    try {
      // One deadline covers acquisition, every query, and rollback cleanup.
      await Promise.race([operation(), interrupted.promise]);
    } catch {
      throw new Error(failureCode);
    } finally {
      clearTimeout(timer);
    }
  };
}
