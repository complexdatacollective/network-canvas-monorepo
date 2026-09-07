import type pg from 'pg';

import { loadRegistryAccountAssets } from './account-assets.ts';
import { createRegistryApp } from './app.ts';
import { createRegistryAuth } from './auth/service.ts';
import type { RegistryBlobStore } from './blob-store.ts';
import { startRegistryCleanup } from './cleanup-worker.ts';
import { copyRegistryDatabasePolicy } from './db/admission.ts';
import { verifyRegistryDatabases } from './db/schema-state.ts';
import type { RegistryDiagnostic } from './diagnostics.ts';
import type { RegistryEnv } from './env.ts';
import { createRegistryMailer } from './mailer.ts';
import { RegistryStore } from './store.ts';

/** Own these resources after entry, including when startup refuses to proceed. */
export async function initializeRegistry({
  configuration,
  pool,
  operatorPool,
  blobs,
  onDiagnostic,
  accountAssetDirectory,
}: {
  configuration: RegistryEnv;
  pool: pg.Pool;
  operatorPool: pg.Pool;
  blobs: RegistryBlobStore;
  onDiagnostic: (code: RegistryDiagnostic, requestId?: string) => void;
  accountAssetDirectory?: string;
}) {
  let mailer: ReturnType<typeof createRegistryMailer> | undefined;
  let worker: ReturnType<typeof startRegistryCleanup> | undefined;
  let accepting = false;
  let closing: Promise<void> | undefined;
  const stopAdmission = () => {
    accepting = false;
  };
  const close = () => {
    closing ??= (async () => {
      stopAdmission();
      const stopped = worker?.stop();
      mailer?.close();
      // Abort private-store work; an uncommitted cleanup remains retryable.
      blobs.close();
      await stopped;
      await Promise.all([pool.end(), operatorPool.end()]);
    })();
    return closing;
  };
  try {
    const admission = copyRegistryDatabasePolicy(configuration);
    const identity = await verifyRegistryDatabases(
      pool,
      operatorPool,
      admission,
    );
    await blobs.ready();
    const accountAssets = await loadRegistryAccountAssets(
      accountAssetDirectory,
    );
    // No auth callback, email transport, worker, or listener starts before
    // both database roles prove the same current registry installation.
    mailer = createRegistryMailer(
      configuration.mailer,
      pool,
      configuration.magicLinksPerDay,
    );
    const auth = createRegistryAuth({
      pool,
      baseUrl: configuration.publicUrl,
      secret: configuration.authSecret,
      sendMagicLink: mailer.sendMagicLink,
      onDiagnostic,
    });
    const store = new RegistryStore({
      pool,
      operatorPool,
      auth,
      blobs,
      baseUrl: configuration.publicUrl,
      limits: configuration.limits,
    });
    const app = createRegistryApp({
      auth,
      store,
      accountAssets,
      accepting: () => accepting,
      ready: async () => {
        if (!accepting) return false;
        const [currentIdentity] = await Promise.all([
          verifyRegistryDatabases(pool, operatorPool, admission),
          blobs.ready(),
        ]);
        return accepting && currentIdentity === identity;
      },
      onDiagnostic,
    });
    worker = startRegistryCleanup({
      store,
      onFailure: () => onDiagnostic('REGISTRY_CLEANUP_FAILED'),
    });
    accepting = true;
    return { app, stopAdmission, close };
  } catch {
    await close();
    throw new Error('REGISTRY_STARTUP_FAILED');
  }
}

export type RegistryRuntime = Awaited<ReturnType<typeof initializeRegistry>>;
