import type pg from 'pg';

import { assertSafePostgresDatabaseEnrollment } from './postgres-database-enrollment.ts';
import {
  assertSafePostgresRestrictedIdentities,
  copyPostgresRestrictedIdentityPolicy,
  type PostgresRestrictedIdentityPolicy,
} from './postgres-restricted-identities.ts';
import { validateRoleNames } from './role-bootstrap.ts';

export type PostgresRuntimeIdentity = PostgresRestrictedIdentityPolicy &
  Readonly<{
    intendedRole: string;
    allowedRoles: readonly string[];
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
  let policy: ReturnType<typeof copyPostgresRestrictedIdentityPolicy>;
  try {
    const candidateRole: unknown = configuration.intendedRole;
    const candidateRoles: unknown = configuration.allowedRoles;
    policy = copyPostgresRestrictedIdentityPolicy(configuration);
    if (!Array.isArray(candidateRoles)) throw new Error();
    const copied: unknown[] = [...candidateRoles];
    if (!copied.every((role): role is string => typeof role === 'string')) {
      throw new Error();
    }
    validateRoleNames(copied);
    if (typeof candidateRole !== 'string' || !copied.includes(candidateRole)) {
      throw new Error();
    }
    if (
      !policy.runtimeRoleSets.some(
        (roleSet) =>
          roleSet.length === copied.length &&
          roleSet.every((role) => copied.includes(role)),
      )
    )
      throw new Error();
    roles = copied;
    intendedRole = candidateRole;
  } catch {
    throw new Error('POSTGRES_RUNTIME_IDENTITY_INVALID');
  }

  try {
    await assertSafePostgresDatabaseEnrollment(client, policy.allowedLogins);
    await assertSafePostgresRestrictedIdentities(client, policy);
    const result = await client.query<{ safe: boolean }>(
      `WITH database AS MATERIALIZED (
        SELECT oid, datdba, datacl FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()
      ), login AS MATERIALIZED (
        SELECT * FROM pg_catalog.pg_roles WHERE rolname = session_user
      ), scoped AS MATERIALIZED (
        SELECT * FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])
      ), access AS MATERIALIZED (
        SELECT privilege.* FROM database,
          pg_catalog.aclexplode(COALESCE(database.datacl, pg_catalog.acldefault('d', database.datdba))) privilege
        WHERE privilege.privilege_type = 'CONNECT'
      ) SELECT current_user = $2::pg_catalog.text AND session_user <> ALL($1::pg_catalog.text[])
        AND session_user = ANY($3::pg_catalog.text[])
        AND session_user <> ALL($4::pg_catalog.text[])
        AND current_user <> ALL($4::pg_catalog.text[])
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
        AND NOT EXISTS (SELECT 1 FROM login, database WHERE login.oid = database.datdba) AS safe`,
      [roles, intendedRole, policy.allowedLogins, policy.administrativeLogins],
    );
    const identity = result.rows[0];
    if (identity?.safe !== true) throw new Error();
  } catch {
    // Never propagate SQL, identifiers, connection configuration or raw causes.
    throw new Error('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
  }
}
