import {
  createPostgresBackupVerifier,
  type PostgresBackupConfiguration,
} from '@codaco/studio-sync/postgres-backup';
import { BACKUP_ROLE } from '@codaco/studio-sync/rls';

import { SCHEMA_TABLES } from './schema.ts';

const STUDIO_BACKUP_CONFIGURATION: PostgresBackupConfiguration = {
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
};
// The stored-key corpus is exhaustive and may scale with retained data. Keep
// its longer bound local to custody verification; structural checks stay at
// the shared ten-second default.
const STUDIO_BACKUP_CUSTODY_TIMEOUT_MS = 5 * 60 * 1000;

/** Require complete cross-tenant reads with the dedicated read-only backup
 * identity, pinned to one 10-second bounded connection before pg_dump captures
 * data. */
export const assertBackupAccess = createPostgresBackupVerifier(
  STUDIO_BACKUP_CONFIGURATION,
);

/**
 * Verify the exhaustive stored-key corpus on the same read-only connection as
 * the structural backup checks. Custody is intentionally allowed five minutes
 * because the corpus scan scales with retained data; the ordinary structural
 * verifier remains on its ten-second fail-closed deadline.
 */
export const assertBackupCustodyAccess = createPostgresBackupVerifier({
  ...STUDIO_BACKUP_CONFIGURATION,
  timeoutMs: STUDIO_BACKUP_CUSTODY_TIMEOUT_MS,
});
