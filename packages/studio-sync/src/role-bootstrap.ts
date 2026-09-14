import { escapeIdentifier, escapeLiteral } from 'pg';

/** PostgreSQL truncates names beyond 63 bytes; never enroll a different role. */
export function validateRoleNames(roles: readonly string[]): void {
  if (
    roles.length === 0 ||
    new Set(roles).size !== roles.length ||
    roles.some(
      (role) =>
        !role ||
        !role.isWellFormed() ||
        role.includes('\0') ||
        new TextEncoder().encode(role).length > 63,
    )
  ) {
    throw new Error(
      'Supply a nonempty, unique list of valid PostgreSQL role names.',
    );
  }
}

/** Repeatable operator security, separate from immutable schema sidecars. */
export function runtimeRolesSql(roles: readonly string[]): string {
  validateRoleNames(roles);
  const names = roles.map(escapeLiteral).join(', ');
  const body = `DECLARE conflicting_constraint text;
BEGIN
  ${roles
    .map(
      (role) => `
  -- A pre-created role must work for an operator without CREATEROLE. Role
  -- names are cluster-wide; advisory locks serialize only one database.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${escapeLiteral(role)}) THEN
    BEGIN
      CREATE ROLE ${escapeIdentifier(role)} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS conflicting_constraint = CONSTRAINT_NAME;
        IF conflicting_constraint <> 'pg_authid_rolname_index' THEN RAISE; END IF;
    END;
  END IF;`,
    )
    .join('\n')}
  -- Re-read and validate the winner after a duplicate-name race too. A safe
  -- direct role can still assume or inherit an unsafe parent role.
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN (${names})) <> ${roles.length}
    OR EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname IN (${names})
        AND (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb OR rolreplication)
    ) THEN
    RAISE EXCEPTION 'Studio runtime roles must be NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB, and NOREPLICATION.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members membership JOIN pg_roles role ON role.oid = membership.member
    WHERE role.rolname IN (${names})
  ) THEN
    RAISE EXCEPTION 'Studio runtime roles must have no parent memberships.' USING ERRCODE = '42501';
  END IF;
END;`;
  // Quoting the whole body also protects role names containing dollar tags.
  return `DO ${escapeLiteral(body)};`;
}

/** One reviewed list for administrator provisioning and migration verification. */
export const RESTRICTED_LARGE_OBJECT_FUNCTIONS = [
  'pg_catalog.lo_create(oid)',
  'pg_catalog.lo_creat(integer)',
  'pg_catalog.lo_from_bytea(oid,bytea)',
  'pg_catalog.lo_import(text)',
  'pg_catalog.lo_import(text,oid)',
  'pg_catalog.lo_export(oid,text)',
] as const;

/** Run as the built-in function owner in each dedicated application database.
 * This removes PUBLIC and direct grants; it never grants administrative access. */
export function revokeLargeObjectPrivilegesSql(
  roles: readonly string[] = [],
): string {
  if (roles.length) validateRoleNames(roles);
  return `REVOKE EXECUTE ON FUNCTION ${RESTRICTED_LARGE_OBJECT_FUNCTIONS.join(', ')} FROM PUBLIC${roles.map((role) => `, ${escapeIdentifier(role)}`).join('')};`;
}
