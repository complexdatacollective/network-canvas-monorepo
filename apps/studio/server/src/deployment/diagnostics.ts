import { createAssetStore } from '../assets.ts';
import { createMaintenancePool, createPool } from '../db/pool.ts';
import type { StudioEnv } from '../env.ts';
import type { EncryptionEnv } from '../env/encryption.ts';
import { createReadiness } from '../observability/readiness.ts';
import { loadEncryptionKeys } from '../pii/keys.ts';

/** A separate operator-only read: no app/auth/worker or proof registration. */
export async function collectDiagnostics(
  env: StudioEnv,
  encryption: () => EncryptionEnv,
) {
  const readOnly = (db: StudioEnv['db']) => {
    if (!db) return undefined;
    const url = new URL(db.url);
    const options = url.searchParams.get('options');
    url.searchParams.set(
      'options',
      `${options ? `${options} ` : ''}-c default_transaction_read_only=on`,
    );
    return { url: url.href };
  };
  const appDb = env.role === 'worker' ? undefined : readOnly(env.db);
  const maintenanceDb = readOnly(env.maintenanceDb);
  const pool = appDb ? createPool(appDb) : undefined;
  const maintenancePool = maintenanceDb
    ? createMaintenancePool(maintenanceDb)
    : undefined;
  const databasePool = pool ?? maintenancePool;
  const readiness = createReadiness({
    pool,
    maintenancePool,
    assetStore: env.s3 ? createAssetStore(env.s3) : undefined,
    cacheMs: 0,
    allowUnversionedSchema: env.devDefaults,
    allowedLogins: env.databaseAllowedLogins,
    administrativeLogins: env.databaseAdministrativeLogins,
  });
  try {
    let rootsLoadable = false;
    try {
      const selected = encryption();
      await loadEncryptionKeys(selected.configuration, selected.loadRootKey);
      rootsLoadable = true;
    } catch {
      // A boolean is deliberate: never return key IDs, references or values.
    }
    const readinessResult = await readiness.check();
    type DatabaseProfile = {
      sharedBuffersBytes: number;
      workMemBytes: number;
      maxConnections: number;
      readOnly: boolean;
    };
    let databaseProfile: DatabaseProfile | null = null;
    if (databasePool && readinessResult.checks.database === 'ok') {
      const result = await databasePool.query<DatabaseProfile>(`
        SELECT pg_size_bytes(current_setting('shared_buffers'))::float8 AS "sharedBuffersBytes",
          pg_size_bytes(current_setting('work_mem'))::float8 AS "workMemBytes",
          current_setting('max_connections')::integer AS "maxConnections",
          current_setting('transaction_read_only') = 'on' AS "readOnly"
      `);
      databaseProfile = result.rows[0] ?? null;
    }
    return {
      deploymentMode: env.deploymentMode,
      role: env.role,
      configured: {
        database: Boolean(env.db),
        objectStore: Boolean(env.s3),
        smtp: env.auth?.mailer.kind === 'smtp',
        bootstrapToken: Boolean(env.bootstrapToken),
        metrics: Boolean(env.metricsToken),
      },
      readiness: readinessResult,
      databaseProfile,
      encryption: {
        rootsLoadable,
        // Actual historical-key verification is the startup/explicit verify
        // command's responsibility: it can register new immutable key proofs.
        historicalKeyVerification: 'not_run_read_only' as const,
      },
    };
  } finally {
    readiness.stop();
    await Promise.all([pool?.end(), maintenancePool?.end()]);
  }
}
