import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';
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
  await client.query(runtimeRolesSql(Object.values(TENANT_ROLES)));
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
  const logins = await client.query<{ rolname: string; safe: boolean }>(
    `SELECT rolname, rolcanlogin AND (rolname = session_user OR NOT (
      rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication
    )) AS safe FROM pg_roles WHERE rolname = ANY($1::text[])`,
    [allowedLogins],
  );
  if (
    logins.rows.length !== allowedLogins.length ||
    logins.rows.some(({ safe }) => !safe)
  ) {
    throw new Error(
      'Enrolled Studio identities must exist and allow LOGIN; non-operator logins must not hold database administration or replication attributes.',
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
}
