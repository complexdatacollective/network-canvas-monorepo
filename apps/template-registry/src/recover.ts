import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { createRegistryBlobStore } from './blob-store.ts';
import { setRegistryPoolBounds } from './db/pool.ts';
import { REGISTRY_BACKUP_ROLE } from './db/schema.ts';
import { logRegistryDiagnostic } from './diagnostics.ts';
import { readRegistryRecoveryEnv } from './env.ts';
import { readRegistryRecoveryReconciliation } from './recovery-reconciliation.ts';
import { reconcileRegistryRecovery } from './recovery.ts';

if (import.meta.main) {
  try {
    if (process.argv.length !== 2)
      throw new Error('REGISTRY_RECOVERY_ARGUMENTS_INVALID');
    const configuration = readRegistryRecoveryEnv();
    const reconciliation = await readRegistryRecoveryReconciliation(
      configuration.reconciliationPath,
      configuration.reconciliationSha256,
    );
    const pool = createPostgresPool({
      connectionString: configuration.databaseUrl,
      // Recovery Compose owns this URL and always uses the database owner.
      // Parse and pin that identity before applying the shared pool bounds;
      // an unparsed URL could otherwise restore conflicting startup options.
      role: 'registry_migrator',
      max: 1,
      onIdleError: () => logRegistryDiagnostic('REGISTRY_DATABASE_IDLE_ERROR'),
      roleMismatchCode: 'REGISTRY_DATABASE_ROLE_MISMATCH',
    });
    const backupPool = createPostgresPool({
      connectionString: configuration.backupDatabaseUrl,
      role: REGISTRY_BACKUP_ROLE,
      max: 1,
      onIdleError: () => logRegistryDiagnostic('REGISTRY_DATABASE_IDLE_ERROR'),
    });
    setRegistryPoolBounds(pool);
    setRegistryPoolBounds(backupPool);
    const blobs = createRegistryBlobStore(configuration.s3);
    try {
      await reconcileRegistryRecovery({
        pool,
        backupPool,
        blobs,
        admission: configuration,
        reconciliation,
      });
      logRegistryDiagnostic('REGISTRY_RECOVERY_RECONCILED');
    } finally {
      blobs.close();
      await Promise.all([pool.end(), backupPool.end()]);
    }
  } catch {
    logRegistryDiagnostic('REGISTRY_RECOVERY_FAILED');
    process.exitCode = 1;
  }
}
