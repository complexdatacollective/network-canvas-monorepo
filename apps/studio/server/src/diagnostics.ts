import { collectDiagnostics } from './deployment/diagnostics.ts';
import { readEncryptionEnv, readEnv } from './env.ts';

try {
  if (process.argv.length !== 2) throw new Error('No arguments accepted.');
  const result = await collectDiagnostics(readEnv(), () => readEncryptionEnv());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.readiness.status !== 'ready' || !result.encryption.rootsLoadable)
    process.exitCode = 1;
} catch {
  process.stderr.write(
    'Studio diagnostics failed. Check the configured services and environment.\n',
  );
  process.exitCode = 1;
}
