import { fileURLToPath } from 'node:url';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { assertRegistryMigrationOperator } from './db/admission.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import { logRegistryDiagnostic } from './diagnostics.ts';
import { readRegistryMigrationEnv } from './env.ts';

if (import.meta.main) {
  try {
    if (process.argv.length !== 2)
      throw new Error('REGISTRY_MIGRATION_ARGUMENTS_INVALID');
    const configuration = readRegistryMigrationEnv();
    const migrations = await readMigrations(
      fileURLToPath(new URL('../migrations', import.meta.url)),
      'Template Registry',
    );
    const pool = createPostgresPool({
      connectionString: configuration.databaseUrl,
      max: 1,
      onIdleError: () => logRegistryDiagnostic('REGISTRY_DATABASE_IDLE_ERROR'),
    });
    try {
      await assertRegistryMigrationOperator(pool, configuration);
      await registryMigrator.migrate(
        pool,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        configuration.allowedLogins,
      );
      logRegistryDiagnostic('REGISTRY_MIGRATION_COMPLETE');
    } finally {
      await pool.end();
    }
  } catch {
    logRegistryDiagnostic('REGISTRY_MIGRATION_FAILED');
    process.exitCode = 1;
  }
}
