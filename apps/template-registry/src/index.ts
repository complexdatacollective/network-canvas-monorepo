import { createRegistryBlobStore } from './blob-store.ts';
import { createRegistryPool } from './db/pool.ts';
import { logRegistryDiagnostic } from './diagnostics.ts';
import { readRegistryEnv } from './env.ts';
import { initializeRegistry } from './runtime.ts';
import { listenRegistry } from './server.ts';

const fatal = () => {
  logRegistryDiagnostic('REGISTRY_PROCESS_FAILED');
  process.exit(1);
};
const onIdleError = () => logRegistryDiagnostic('REGISTRY_DATABASE_IDLE_ERROR');

if (import.meta.main) {
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
  try {
    const configuration = readRegistryEnv();
    const pool = createRegistryPool({
      connectionString: configuration.databaseUrl,
      purpose: 'app',
      onIdleError,
    });
    const operatorPool = createRegistryPool({
      connectionString: configuration.operatorDatabaseUrl,
      purpose: 'operator',
      onIdleError,
    });
    const blobs = createRegistryBlobStore(configuration.s3);
    const runtime = await initializeRegistry({
      configuration,
      pool,
      operatorPool,
      blobs,
      onDiagnostic: logRegistryDiagnostic,
    });
    const listener = await listenRegistry(runtime, configuration.port);
    logRegistryDiagnostic('REGISTRY_LISTENING');
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      // Covers every socket, pending database statement and cleanup operation.
      const deadline = setTimeout(() => {
        logRegistryDiagnostic('REGISTRY_SHUTDOWN_FAILED');
        process.exit(1);
      }, 25_000);
      deadline.unref();
      void listener.close().then(
        () => {
          clearTimeout(deadline);
          logRegistryDiagnostic('REGISTRY_SHUTDOWN_COMPLETE');
          process.exit(0);
        },
        () => {
          logRegistryDiagnostic('REGISTRY_SHUTDOWN_FAILED');
          process.exit(1);
        },
      );
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch {
    logRegistryDiagnostic('REGISTRY_STARTUP_FAILED');
    process.exit(1);
  }
}
