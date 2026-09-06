import { createPostgresMigrator } from '@codaco/studio-sync/postgres-migrations';

import { stampRegistryFingerprint } from './schema-state.ts';
import { REGISTRY_ROLES, REGISTRY_BACKUP_ROLE } from './schema.ts';

export const registryMigrator = createPostgresMigrator({
  applicationName: 'Template Registry',
  allowedLoginsSetting: 'REGISTRY_DATABASE_ALLOWED_LOGINS',
  runtimeRoles: Object.values(REGISTRY_ROLES),
  runtimeLoginRoleSets: [[REGISTRY_ROLES.app], [REGISTRY_ROLES.operator]],
  backupRole: REGISTRY_BACKUP_ROLE,
  historySchema: 'registry_migrations',
  schemaName: 'public',
  fingerprintTable: 'registry_schema_fingerprint',
  lockKey: 4021775688147131,
  stampFingerprint: stampRegistryFingerprint,
});
