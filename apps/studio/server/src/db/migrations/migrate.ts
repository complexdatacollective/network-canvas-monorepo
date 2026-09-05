import { createPostgresMigrator } from '@codaco/studio-sync/postgres-migrations';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';

import { SCHEMA_LOCK_KEY, stampFingerprint } from '../schema.ts';

// Studio's names and schema writer stay local; deployment migration behavior
// belongs to the shared engine used by every configured application.
export const {
  migrate: migrateDatabase,
  enforceSecurity: enforceMigrationSecurity,
} = createPostgresMigrator({
  applicationName: 'Studio',
  allowedLoginsSetting: 'STUDIO_DATABASE_ALLOWED_LOGINS',
  runtimeRoles: Object.values(TENANT_ROLES),
  backupRole: BACKUP_ROLE,
  historySchema: 'studio_migrations',
  schemaName: 'public',
  fingerprintTable: 'schemaFingerprint',
  lockKey: SCHEMA_LOCK_KEY,
  stampFingerprint,
});
