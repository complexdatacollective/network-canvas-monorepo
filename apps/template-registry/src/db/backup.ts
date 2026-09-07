import { getTableName } from 'drizzle-orm';

import { createPostgresBackupVerifier } from '@codaco/studio-sync/postgres-backup';

import { REGISTRY_BACKUP_ROLE, REGISTRY_TABLES } from './schema.ts';

/** The independent registry has no tenant RLS; unexpected filtering is unsafe. */
export const assertRegistryBackupAccess = createPostgresBackupVerifier({
  role: REGISTRY_BACKUP_ROLE,
  completeSchemas: ['public', 'registry_migrations'],
  expectedTables: [
    ...Object.values(REGISTRY_TABLES).map((table) => ({
      schema: 'public',
      name: getTableName(table),
    })),
    { schema: 'registry_migrations', name: 'history' },
  ],
  rowSecurity: { mode: 'forbid' },
  failureCode: 'REGISTRY_BACKUP_ACCESS_UNSAFE',
});
