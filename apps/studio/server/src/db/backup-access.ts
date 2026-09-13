import { BACKUP_ROLE } from '@codaco/studio-sync/rls';
import { runtimeRolesSql } from '@codaco/studio-sync/role-bootstrap';

// The database backup process has separate operator-held credentials. Runtime
// pools never receive membership in this role. Dedicated SELECT policies let
// it read every tenant without requiring a managed-provider BYPASSRLS role.
export const BACKUP_ACCESS_SIDECAR_SQL = `
${runtimeRolesSql([BACKUP_ROLE])}
DO $$ BEGIN
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM ${BACKUP_ROLE}', current_schema());
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${BACKUP_ROLE}', current_schema());
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM ${BACKUP_ROLE}', current_schema());
  EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO ${BACKUP_ROLE}', current_schema());
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM ${BACKUP_ROLE}', current_schema());
  -- SELECT reads sequence state for pg_dump; USAGE/UPDATE could advance it.
  EXECUTE format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO ${BACKUP_ROLE}', current_schema());
  IF to_regclass('studio_migrations.history') IS NOT NULL THEN
    REVOKE ALL ON SCHEMA studio_migrations FROM ${BACKUP_ROLE};
    GRANT USAGE ON SCHEMA studio_migrations TO ${BACKUP_ROLE};
    REVOKE ALL ON studio_migrations.history FROM ${BACKUP_ROLE};
    GRANT SELECT ON studio_migrations.history TO ${BACKUP_ROLE};
  END IF;
END $$;
`;
