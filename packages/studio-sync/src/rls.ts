// Row-level security for the team boundary (#1249). Ships in the server's
// production bundle beside schema.ts: import nothing beyond drizzle-orm.
//
// Every tenant table carries one permissive policy: a row is visible, and may
// be written, only when its team_id equals the transaction-local GUC that
// TenantDb.transaction() stamps (tenant.ts) — or when the current role is the
// maintenance role, which is how garbage collection visits every tenant.
//
// The policy alone is decorative for a table owner (owners bypass RLS unless
// the table is FORCEd) and for a superuser (who bypasses it regardless). The
// sidecar therefore FORCEs every tenant table, and the application never
// runs as the connecting login: its pool starts every session with
// `role=studio_app`, a NOLOGIN, NOSUPERUSER, NOBYPASSRLS role the sidecar
// creates. Maintenance is a policy clause rather than a BYPASSRLS role because
// only a superuser can create one of those, which managed Postgres never
// grants.
import { sql } from 'drizzle-orm';
import { pgPolicy } from 'drizzle-orm/pg-core';

export const TENANT_ROLES = {
  app: 'studio_app',
  maintenance: 'studio_maintenance',
} as const;

export const TEAM_GUC = 'app.team_id';

// NULLIF: once a transaction-scoped setting has expired,
// current_setting(name, true) yields '' rather than NULL for the rest of the
// session. '' matches no team, so the policy still fails closed, and NULLIF
// keeps that explicit should team_id ever gain a cast.
const TEAM_ISOLATION_PREDICATE = `team_id = NULLIF(current_setting('${TEAM_GUC}', true), '') OR current_user = '${TENANT_ROLES.maintenance}'`;

/** A fresh policy per table: drizzle links a policy to exactly one table. */
export function teamIsolationPolicy() {
  return pgPolicy('team_isolation', {
    for: 'all',
    using: sql.raw(TEAM_ISOLATION_PREDICATE),
    withCheck: sql.raw(TEAM_ISOLATION_PREDICATE),
  });
}

// Serialises role bootstrap across sessions provisioning schemas in parallel
// (the test suites do), so a race on CREATE ROLE or GRANT cannot surface as a
// spurious error.
const ROLE_BOOTSTRAP_LOCK_KEY = 4021775688147130;

/**
 * Idempotent, and safe for a non-superuser applier with CREATEROLE: a PG16+
 * creator is implicitly a member of the role it creates, but without the SET
 * privilege the pool needs, hence the explicit grant. Unqualified so it lands
 * in whichever schema the statements run in — the scratch schemas the suites
 * provision as well as `public`.
 */
export const TENANT_ROLES_SQL = `
DO $$ BEGIN
  PERFORM pg_advisory_xact_lock(${ROLE_BOOTSTRAP_LOCK_KEY});
  -- Checking existence before CREATE also supports an operator whose roles
  -- were provisioned by an administrator: PostgreSQL checks CREATEROLE before
  -- reporting duplicate_object, so catching that exception is not sufficient.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TENANT_ROLES.app}') THEN
    CREATE ROLE ${TENANT_ROLES.app} NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TENANT_ROLES.maintenance}') THEN
    CREATE ROLE ${TENANT_ROLES.maintenance} NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT pg_has_role(current_user, '${TENANT_ROLES.app}', 'SET') THEN
    EXECUTE format('GRANT ${TENANT_ROLES.app} TO %I WITH SET TRUE', current_user);
  END IF;
  IF NOT pg_has_role(current_user, '${TENANT_ROLES.maintenance}', 'SET') THEN
    EXECUTE format('GRANT ${TENANT_ROLES.maintenance} TO %I WITH SET TRUE', current_user);
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}', current_schema());
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}', current_schema());
END $$;
`;

/** FORCE plus the DML grants for a set of tenant tables. */
export function tenantTablesSql(tables: readonly string[]): string {
  return [
    ...tables.map((table) => `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`),
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${tables.join(', ')} TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};`,
  ].join('\n');
}
