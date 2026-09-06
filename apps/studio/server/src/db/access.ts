import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// General privileges for the roles the application runs as
// (studio-sync/src/rls.ts), over every table — the tenant tables again, and
// the better-auth and fingerprint tables that carry no policy. Schema usage
// and sequences are granted where the roles are created. Hashed into the
// schema fingerprint — whitespace counts. Table-specific restrictions, such
// as audit history's immutability revocations, run after this sidecar. The
// boot fingerprint is evidence written only by the explicit schema migrator.
export const ACCESS_SIDECAR_SQL = `
DO $$ BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}', current_schema());
END $$;
`;

// Separate from the broad grant so the sidecar ordering oracle stays strict.
export const FINGERPRINT_ACCESS_SIDECAR_SQL = `
DO $$ BEGIN
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I."schemaFingerprint" FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}', current_schema());
END $$;
`;
