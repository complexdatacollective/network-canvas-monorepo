import type pg from 'pg';

import { assertSafePostgresCatalogPrivileges } from './postgres-catalog-privileges.ts';
import { copyPostgresAdministrativeLogins } from './postgres-database-enrollment.ts';
import {
  RESTRICTED_LARGE_OBJECT_FUNCTIONS,
  validateRoleNames,
} from './role-bootstrap.ts';

export type PostgresRestrictedIdentityPolicy = Readonly<{
  allowedLogins: readonly string[];
  administrativeLogins?: readonly string[];
  runtimeRoleSets: readonly (readonly string[])[];
  backupRole?: string;
}>;

type FailureReason =
  | 'configuration'
  | 'roles'
  | 'logins'
  | 'parents'
  | 'memberships'
  | 'parameters'
  | 'persisted'
  | 'large-object-creation'
  | 'access'
  | 'catalog'
  | 'unavailable';

export class UnsafePostgresRestrictedIdentitiesError extends Error {
  readonly reason: FailureReason;
  constructor(reason: FailureReason) {
    super('POSTGRES_RESTRICTED_IDENTITIES_UNSAFE');
    this.name = 'UnsafePostgresRestrictedIdentitiesError';
    this.reason = reason;
  }
}

/** Validate and snapshot a caller-owned policy before its first await. */
export function copyPostgresRestrictedIdentityPolicy(
  configuration: PostgresRestrictedIdentityPolicy,
) {
  let allowedLogins: string[];
  let administrativeLogins: string[];
  let runtimeRoleSets: string[][];
  let runtimeRoles: string[];
  let backupRole: string | undefined;
  try {
    const sourceLogins: unknown = configuration.allowedLogins;
    if (!Array.isArray(sourceLogins)) throw new Error();
    const copiedLogins: unknown[] = [...sourceLogins];
    if (!copiedLogins.every((name): name is string => typeof name === 'string'))
      throw new Error();
    validateRoleNames(copiedLogins);
    allowedLogins = copiedLogins;
    administrativeLogins = copyPostgresAdministrativeLogins(
      allowedLogins,
      configuration.administrativeLogins,
    );
    const sourceSets: unknown = configuration.runtimeRoleSets;
    if (!Array.isArray(sourceSets) || sourceSets.length === 0)
      throw new Error();
    runtimeRoleSets = sourceSets.map((sourceSet: unknown) => {
      if (!Array.isArray(sourceSet)) throw new Error();
      const copied: unknown[] = [...sourceSet];
      if (!copied.every((name): name is string => typeof name === 'string'))
        throw new Error();
      validateRoleNames(copied);
      return copied;
    });
    runtimeRoles = runtimeRoleSets.flat();
    const sourceBackup: unknown = configuration.backupRole;
    if (sourceBackup !== undefined && typeof sourceBackup !== 'string')
      throw new Error();
    backupRole = sourceBackup;
    validateRoleNames([
      ...runtimeRoles,
      ...(backupRole === undefined ? [] : [backupRole]),
    ]);
    if (
      [...runtimeRoles, backupRole].some(
        (role) => role !== undefined && allowedLogins.includes(role),
      )
    )
      throw new Error();
  } catch {
    throw new UnsafePostgresRestrictedIdentitiesError('configuration');
  }
  return { allowedLogins, administrativeLogins, runtimeRoleSets, backupRole };
}

/** Read-only capability verification for every enrolled non-administrative LOGIN
 * and its reviewed role class. Enrollment/CONNECT admission and the current
 * pool's intended role are independently verified by their existing guards.
 * A class is an exact SET-only membership set; mixed classes are never accepted.
 * Singleton classes distinguish app, maintenance/operator and backup identities.
 * The caller owns this pinned connection and its transaction. */
export async function assertSafePostgresRestrictedIdentities(
  client: pg.PoolClient,
  configuration: PostgresRestrictedIdentityPolicy,
): Promise<void> {
  const { allowedLogins, administrativeLogins, runtimeRoleSets, backupRole } =
    copyPostgresRestrictedIdentityPolicy(configuration);
  const runtimeRoles = runtimeRoleSets.flat();
  try {
    const roles = await client.query<{ rolname: string; safe: boolean }>(
      `SELECT role.rolname, NOT (role.rolcanlogin OR role.rolsuper OR role.rolbypassrls
        OR role.rolcreaterole OR role.rolcreatedb OR role.rolreplication)
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members membership WHERE membership.member = role.oid) AS safe
       FROM pg_catalog.pg_roles role WHERE role.rolname = ANY($1::pg_catalog.text[])`,
      [[...runtimeRoles, ...(backupRole === undefined ? [] : [backupRole])]],
    );
    if (
      runtimeRoles.some(
        (role) => !roles.rows.some(({ rolname }) => rolname === role),
      ) ||
      roles.rows.some(({ safe }) => !safe)
    )
      throw new UnsafePostgresRestrictedIdentitiesError('roles');
    const scopedRoles = roles.rows.map(({ rolname }) => rolname);
    const identity = await client.query<{ owner: string }>(
      `SELECT pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()`,
    );
    const owner = identity.rows[0]?.owner;
    if (!owner || !allowedLogins.includes(owner))
      throw new UnsafePostgresRestrictedIdentitiesError('logins');
    const administrators = [...new Set([owner, ...administrativeLogins])];
    const restrictedLogins = allowedLogins.filter(
      (login) => !administrators.includes(login),
    );
    const logins = await client.query<{ rolname: string; safe: boolean }>(
      `SELECT rolname, rolcanlogin AND (rolname = ANY($2::pg_catalog.text[]) OR NOT (
      rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolinherit
    )) AS safe FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])`,
      [allowedLogins, administrators],
    );
    if (
      logins.rows.length !== allowedLogins.length ||
      logins.rows.some(({ safe }) => !safe)
    ) {
      throw new UnsafePostgresRestrictedIdentitiesError('logins');
    }
    const memberships = await client.query<{ present: boolean }>(
      `SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles enrolled ON enrolled.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    WHERE enrolled.rolname = ANY($1::pg_catalog.text[]) AND NOT member.rolsuper
      AND NOT member.rolname = ANY($1::pg_catalog.text[])
  ) AS present`,
      [allowedLogins],
    );
    if (memberships.rows[0]?.present) {
      throw new UnsafePostgresRestrictedIdentitiesError('parents');
    }
    const scopedMemberships = await client.query<{ safe: boolean }>(
      `SELECT NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles login WHERE login.rolname = ANY($1::pg_catalog.text[])
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements($2::pg_catalog.jsonb) role_class
        WHERE (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members membership WHERE membership.member = login.oid) = pg_catalog.jsonb_array_length(role_class)
          AND NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_auth_members membership JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
            WHERE membership.member = login.oid AND (
              NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(role_class) required_role WHERE required_role = parent.rolname)
              OR membership.admin_option OR membership.inherit_option OR NOT membership.set_option
            )
          )
      )
    ) AS safe`,
      [
        restrictedLogins,
        JSON.stringify([
          ...runtimeRoleSets,
          ...(backupRole === undefined ? [] : [[backupRole]]),
        ]),
      ],
    );
    if (scopedMemberships.rows[0]?.safe !== true)
      throw new UnsafePostgresRestrictedIdentitiesError('memberships');
    const sessionCapabilities = await client.query<{ safe: boolean }>(
      `SELECT pg_catalog.current_setting('lo_compat_privileges') = 'off'
      AND pg_catalog.current_setting('session_replication_role') = 'origin' AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles identity
      CROSS JOIN pg_catalog.unnest(ARRAY['lo_compat_privileges', 'session_replication_role']) parameter
      WHERE (identity.rolname = ANY($1::pg_catalog.text[]) OR identity.rolname = ANY($2::pg_catalog.text[]))
        AND pg_catalog.has_parameter_privilege(identity.oid, parameter, 'SET')
    ) AS safe`,
      [restrictedLogins, scopedRoles],
    );
    if (sessionCapabilities.rows[0]?.safe !== true) {
      throw new UnsafePostgresRestrictedIdentitiesError('parameters');
    }
    const persistedCapabilities = await client.query<{ present: boolean }>(
      `SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_db_role_setting setting CROSS JOIN pg_catalog.unnest(setting.setconfig) config
      WHERE setting.setdatabase IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()))
        AND (setting.setrole = 0 OR setting.setrole IN (
          SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[]) OR rolname = ANY($2::pg_catalog.text[])
        ))
        AND CASE pg_catalog.split_part(config, '=', 1)
          WHEN 'lo_compat_privileges' THEN pg_catalog.split_part(config, '=', 2)::pg_catalog.bool
          WHEN 'session_replication_role' THEN pg_catalog.split_part(config, '=', 2) <> 'origin'
          ELSE false END
    ) AS present`,
      [restrictedLogins, scopedRoles],
    );
    if (persistedCapabilities.rows[0]?.present !== false) {
      throw new UnsafePostgresRestrictedIdentitiesError('persisted');
    }
    const largeObjectCreation = await client.query<{ present: boolean }>(
      `SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles identity CROSS JOIN pg_catalog.unnest($3::pg_catalog.regprocedure[]) routine
      WHERE (identity.rolname = ANY($1::pg_catalog.text[]) OR identity.rolname = ANY($2::pg_catalog.text[]))
        AND pg_catalog.has_function_privilege(identity.oid, routine, 'EXECUTE')
    ) AS present`,
      [restrictedLogins, scopedRoles, RESTRICTED_LARGE_OBJECT_FUNCTIONS],
    );
    if (largeObjectCreation.rows[0]?.present !== false) {
      throw new UnsafePostgresRestrictedIdentitiesError(
        'large-object-creation',
      );
    }
    const loginAccess = await client.query<{
      safe: boolean;
    }>(
      `WITH logins AS (
      SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])
    ), identities AS (
      SELECT oid, rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[]) OR rolname = ANY($2::pg_catalog.text[])
    ), namespaces AS (
      SELECT oid FROM pg_catalog.pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
    ) SELECT NOT EXISTS (
      SELECT 1 FROM identities login WHERE
        pg_catalog.has_database_privilege(login.oid, pg_catalog.current_database(), 'CREATE,TEMPORARY,CONNECT WITH GRANT OPTION')
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_shdepend dependency
          WHERE dependency.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass AND dependency.refobjid = login.oid
            AND dependency.deptype = 'o'
            AND dependency.dbid IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()))
        )
        OR EXISTS (
          SELECT 1 FROM namespaces WHERE pg_catalog.has_schema_privilege(login.oid, oid, 'CREATE,USAGE WITH GRANT OPTION')
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_proc routine WHERE routine.pronamespace IN (SELECT oid FROM namespaces)
            AND ((routine.prosecdef AND pg_catalog.has_function_privilege(login.oid, routine.oid, 'EXECUTE'))
              OR pg_catalog.has_function_privilege(login.oid, routine.oid, 'EXECUTE WITH GRANT OPTION'))
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_largeobject_metadata object WHERE
            pg_catalog.has_largeobject_privilege(login.oid, object.oid, 'UPDATE,SELECT WITH GRANT OPTION')
            OR (login.rolname IS DISTINCT FROM $3 AND pg_catalog.has_largeobject_privilege(login.oid, object.oid, 'SELECT'))
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('v', 'm', 'f') THEN (
              pg_catalog.has_table_privilege(login.oid, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION')
              OR pg_catalog.has_any_column_privilege(login.oid, object.oid, 'INSERT,UPDATE,REFERENCES,SELECT WITH GRANT OPTION')
              OR (login.rolname IS DISTINCT FROM $3 AND (
                pg_catalog.has_table_privilege(login.oid, object.oid, 'SELECT')
                OR pg_catalog.has_any_column_privilege(login.oid, object.oid, 'SELECT')
              ))
            ) ELSE false END
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p') THEN (
              pg_catalog.has_table_privilege(login.oid, object.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,DELETE WITH GRANT OPTION')
              OR pg_catalog.has_any_column_privilege(login.oid, object.oid, 'REFERENCES,SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION')
            ) ELSE false END
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind = 'S'
              THEN pg_catalog.has_sequence_privilege(login.oid, object.oid, 'UPDATE,SELECT WITH GRANT OPTION,USAGE WITH GRANT OPTION')
              ELSE false END
        )
        OR (login.rolname = $3 AND EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p') THEN (
                pg_catalog.has_table_privilege(login.oid, object.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
                OR pg_catalog.has_any_column_privilege(login.oid, object.oid, 'INSERT,UPDATE,REFERENCES')
              ) WHEN object.relkind = 'S'
                THEN pg_catalog.has_sequence_privilege(login.oid, object.oid, 'USAGE,UPDATE')
              ELSE false END
        ))
    ) AND NOT EXISTS (
      SELECT 1 FROM logins login WHERE EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind IN ('r', 'p', 'v', 'm', 'f') THEN (
              pg_catalog.has_table_privilege(login.oid, object.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
              OR pg_catalog.has_any_column_privilege(login.oid, object.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            ) ELSE false END
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object WHERE object.relnamespace IN (SELECT oid FROM namespaces)
            AND CASE WHEN object.relkind = 'S'
              THEN pg_catalog.has_sequence_privilege(login.oid, object.oid, 'SELECT,USAGE,UPDATE')
              ELSE false END
        )
    ) AS safe`,
      [restrictedLogins, scopedRoles, backupRole ?? null],
    );
    if (loginAccess.rows[0]?.safe !== true) {
      throw new UnsafePostgresRestrictedIdentitiesError('access');
    }

    try {
      await assertSafePostgresCatalogPrivileges(client, [
        ...scopedRoles,
        ...restrictedLogins,
      ]);
    } catch {
      throw new UnsafePostgresRestrictedIdentitiesError('catalog');
    }
  } catch (error) {
    if (error instanceof UnsafePostgresRestrictedIdentitiesError) throw error;
    throw new UnsafePostgresRestrictedIdentitiesError('unavailable');
  }
}
