import { fileURLToPath } from 'node:url';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { assertRegistryMigrationOperator } from './db/admission.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './db/fingerprint.generated.ts';
import { registryMigrator } from './db/migrate.ts';
import { changeRegistryOperator } from './db/operators.ts';
import { readRegistrySchemaIdentity } from './db/schema-state.ts';
import { logRegistryDiagnostic } from './diagnostics.ts';
import { readRegistryMigrationEnv } from './env.ts';

if (import.meta.main) {
  try {
    const [action, userId, ...extra] = process.argv.slice(2);
    if (
      !['grant', 'revoke'].includes(action ?? '') ||
      !userId ||
      userId.length > 255 ||
      !userId.isWellFormed() ||
      userId.includes('\0') ||
      extra.length
    )
      throw new Error('REGISTRY_OPERATOR_ARGUMENTS_INVALID');
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
      // A grant does not implicitly upgrade the schema. Once current, run the
      // migration lane's no-op validation before accepting its security state.
      const preflight = await pool.connect();
      let discard = false;
      try {
        await preflight.query('BEGIN; SET LOCAL search_path = public');
        await assertRegistryMigrationOperator(preflight, configuration);
        await registryMigrator.enforceSecurity(
          preflight,
          configuration.allowedLogins,
        );
        await readRegistrySchemaIdentity(preflight, configuration);
      } finally {
        try {
          await preflight.query('ROLLBACK');
        } catch {
          discard = true;
        }
        preflight.release(discard);
      }
      await registryMigrator.migrate(
        pool,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        configuration.allowedLogins,
      );
      await changeRegistryOperator(pool, userId, action === 'grant');
      logRegistryDiagnostic('REGISTRY_OPERATOR_COMPLETE');
    } finally {
      await pool.end();
    }
  } catch {
    logRegistryDiagnostic('REGISTRY_OPERATOR_FAILED');
    process.exitCode = 1;
  }
}
