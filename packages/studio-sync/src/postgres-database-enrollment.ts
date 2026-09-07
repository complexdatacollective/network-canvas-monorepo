import type pg from 'pg';

import { validateRoleNames } from './role-bootstrap.ts';

export type PostgresDatabaseEnrollmentOptions = {
  /** Backup capture may verify an enrollment after writers are quarantined. */
  allowClosedEnrolledLogins?: boolean;
};

export class UnsafePostgresDatabaseEnrollmentError extends Error {
  readonly reason: 'configuration' | 'grants' | 'outsider' | 'sessions';

  constructor(reason: UnsafePostgresDatabaseEnrollmentError['reason']) {
    super('POSTGRES_DATABASE_ENROLLMENT_UNSAFE');
    this.name = 'UnsafePostgresDatabaseEnrollmentError';
    this.reason = reason;
  }
}

/** Recheck the administrator's explicit, committed database admission policy.
 * Shared cluster roles do not identify which deployment a LOGIN belongs to.
 * This is read-only; the caller owns the pinned connection and transaction. */
export async function assertSafePostgresDatabaseEnrollment(
  client: pg.PoolClient,
  allowedLogins: readonly string[],
  options: PostgresDatabaseEnrollmentOptions = {},
): Promise<void> {
  let logins: string[];
  let allowClosedEnrolledLogins: boolean;
  try {
    if (!Array.isArray(allowedLogins)) throw new Error();
    const copied: unknown[] = [...allowedLogins];
    if (!copied.every((login): login is string => typeof login === 'string'))
      throw new Error();
    validateRoleNames(copied);
    if (
      options === null ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      !Object.keys(options).every((key) => key === 'allowClosedEnrolledLogins')
    )
      throw new Error();
    const allowClosed = options.allowClosedEnrolledLogins;
    if (allowClosed !== undefined && typeof allowClosed !== 'boolean')
      throw new Error();
    allowClosedEnrolledLogins = allowClosed ?? false;
    logins = copied;
  } catch {
    throw new UnsafePostgresDatabaseEnrollmentError('configuration');
  }
  const enrollment = await client.query<{ valid: boolean }>(
    `WITH database AS MATERIALIZED (
      SELECT * FROM pg_catalog.pg_database WHERE datname = pg_catalog.current_database()
    ), enrolled AS MATERIALIZED (
      SELECT * FROM pg_catalog.pg_roles WHERE rolname = ANY($1::pg_catalog.text[])
    ), access AS MATERIALIZED (
      SELECT acl.grantee FROM database,
        pg_catalog.aclexplode(COALESCE(database.datacl, pg_catalog.acldefault('d', database.datdba))) acl
      WHERE acl.privilege_type = 'CONNECT'
    ) SELECT
      (SELECT count(*) FROM enrolled WHERE rolcanlogin OR $2::boolean) = pg_catalog.cardinality($1::pg_catalog.text[])
      AND EXISTS (SELECT 1 FROM enrolled, database WHERE enrolled.oid = database.datdba)
      AND NOT EXISTS (
        SELECT 1 FROM access LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid = access.grantee
        WHERE access.grantee = 0 OR (NOT grantee.rolsuper AND NOT grantee.rolname = ANY($1::pg_catalog.text[]))
      ) AND NOT EXISTS (
        SELECT 1 FROM enrolled WHERE NOT EXISTS (SELECT 1 FROM access WHERE grantee = enrolled.oid)
      ) AS valid`,
    [logins, allowClosedEnrolledLogins],
  );
  if (enrollment.rows[0]?.valid !== true)
    throw new UnsafePostgresDatabaseEnrollmentError('grants');
  const outsiders = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolcanlogin AND NOT rolsuper
        AND NOT rolname = ANY($1::pg_catalog.text[])
        AND pg_catalog.has_database_privilege(oid, pg_catalog.current_database(), 'CONNECT')
    ) AS present`,
    [logins],
  );
  if (outsiders.rows[0]?.present !== false)
    throw new UnsafePostgresDatabaseEnrollmentError('outsider');
  // Activity snapshots are transaction-cached. Revoking CONNECT does not evict
  // an already admitted session, so refresh and check existing sessions too.
  await client.query('SELECT pg_catalog.pg_stat_clear_snapshot()');
  const sessions = await client.query<{ present: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_stat_activity activity JOIN pg_catalog.pg_roles login ON login.oid = activity.usesysid
      WHERE activity.datname = pg_catalog.current_database() AND NOT login.rolsuper
        AND NOT login.rolname = ANY($1::pg_catalog.text[])
    ) AS present`,
    [logins],
  );
  if (sessions.rows[0]?.present !== false)
    throw new UnsafePostgresDatabaseEnrollmentError('sessions');
}
