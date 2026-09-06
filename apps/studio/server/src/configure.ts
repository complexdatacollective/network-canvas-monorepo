import { fileURLToPath } from 'node:url';

import {
  configureDeployment,
  parseConfigureArguments,
} from './deployment/configure.ts';

try {
  const result = await configureDeployment(
    parseConfigureArguments(process.argv.slice(2)),
    fileURLToPath(new URL('../deployment-bundle', import.meta.url)),
  );
  // This explicitly invoked offline command is the only one-time token output.
  // Normal server startup and diagnostics must never print secret values.
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch {
  process.stderr.write(
    'Configuration refused. Use an empty output directory and configure --domain example.org --email contact@example.org --image registry/studio@sha256:DIGEST --minio-image registry/studio-minio@sha256:DIGEST --output /configuration.\n',
  );
  process.exitCode = 2;
}
