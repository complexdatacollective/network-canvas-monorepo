import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// General privileges for the roles the application runs as
// (studio-sync/src/rls.ts), over every table — the tenant tables again, and
// the better-auth and fingerprint tables that carry no policy. Schema usage
// and sequences are granted where the roles are created. Hashed into the
// schema fingerprint — whitespace counts. Table-specific restrictions, such
// as audit history's immutability revocations, run after this sidecar.
export const ACCESS_SIDECAR_SQL = `
DO $$ BEGIN
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance}', current_schema());
END $$;
`;
