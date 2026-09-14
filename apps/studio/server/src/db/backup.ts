import { createPostgresBackupVerifier } from '@codaco/studio-sync/postgres-backup';
import { BACKUP_ROLE } from '@codaco/studio-sync/rls';

import { SCHEMA_TABLES } from './schema.ts';

/** Require complete cross-tenant reads with the dedicated read-only backup
 * identity, pinned to one bounded connection before pg_dump captures data. */
export const assertBackupAccess = createPostgresBackupVerifier({
  role: BACKUP_ROLE,
  completeSchemas: ['public', 'studio_migrations'],
  expectedTables: [
    ...SCHEMA_TABLES.map((name) => ({ schema: 'public', name })),
    { schema: 'public', name: 'schemaFingerprint' },
    { schema: 'studio_migrations', name: 'history' },
  ],
  rowSecurity: {
    mode: 'policy',
    name: 'backup_read',
    expression: `(CURRENT_USER = '${BACKUP_ROLE}'::name)`,
  },
  failureCode: 'STUDIO_BACKUP_ACCESS_UNSAFE',
});
