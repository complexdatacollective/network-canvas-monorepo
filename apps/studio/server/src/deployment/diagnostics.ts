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
  const url = env.db ? new URL(env.db.url) : undefined;
  if (url) {
    const options = url.searchParams.get('options');
    url.searchParams.set(
      'options',
      `${options ? `${options} ` : ''}-c default_transaction_read_only=on`,
    );
  }
  const pool = url
    ? (env.role === 'worker' ? createMaintenancePool : createPool)({
        url: url.href,
      })
    : undefined;
  const readiness = createReadiness({
    pool,
    assetStore: env.s3 ? createAssetStore(env.s3) : undefined,
    cacheMs: 0,
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
    if (pool && readinessResult.checks.database === 'ok') {
      const result = await pool.query<DatabaseProfile>(`
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
    await pool?.end();
  }
}
