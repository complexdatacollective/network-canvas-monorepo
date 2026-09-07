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
      await assertRegistryBackupAccess(pool, async (client) => {
        // The verifier has proved this actual backup LOGIN is read-only.
        // Quarantined runtime/owner identities stay closed while their complete
        // enrollment, evidence and capability policy is checked on this socket.
        await readRegistrySchemaIdentity(client, configuration, {
          allowClosedEnrolledLogins: true,
        });
      });
      logRegistryDiagnostic('REGISTRY_BACKUP_VERIFIED');
    } finally {
      await pool.end();
    }
  } catch {
    logRegistryDiagnostic('REGISTRY_BACKUP_FAILED');
    process.exitCode = 1;
  }
}
