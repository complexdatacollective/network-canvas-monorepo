import { assertSafePostgresDatabaseEnrollment } from '@codaco/studio-sync/postgres-database-enrollment';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { assertRegistryBackupAccess } from './db/backup.ts';
import { setRegistryPoolBounds } from './db/pool.ts';
import { readRegistrySchemaIdentity } from './db/schema-state.ts';
import { REGISTRY_BACKUP_ROLE } from './db/schema.ts';
import { logRegistryDiagnostic } from './diagnostics.ts';
import { readRegistryBackupEnv } from './env.ts';

if (import.meta.main) {
  try {
    if (process.argv.length !== 2)
      throw new Error('REGISTRY_BACKUP_ARGUMENTS_INVALID');
    const configuration = readRegistryBackupEnv();
    const pool = createPostgresPool({
      connectionString: configuration.databaseUrl,
      role: REGISTRY_BACKUP_ROLE,
      max: 1,
      onIdleError: () => logRegistryDiagnostic('REGISTRY_DATABASE_IDLE_ERROR'),
    });
    setRegistryPoolBounds(pool);
    try {
      await assertRegistryBackupAccess(pool, (client) =>
        assertSafePostgresDatabaseEnrollment(
          client,
          configuration.allowedLogins,
        ),
      );
      await readRegistrySchemaIdentity(pool);
      logRegistryDiagnostic('REGISTRY_BACKUP_VERIFIED');
    } finally {
      await pool.end();
    }
  } catch {
    logRegistryDiagnostic('REGISTRY_BACKUP_FAILED');
    process.exitCode = 1;
  }
}
