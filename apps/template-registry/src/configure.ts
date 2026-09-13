import { readFileSync } from 'node:fs';

import { configureRegistryDeployment } from './deployment/configure.ts';

export async function runRegistryConfigure(
  bytes: Buffer,
  templateRoot = '/app/deployment-bundle',
): Promise<string> {
  if (bytes.length === 0 || bytes.length > 16_384)
    throw new Error('REGISTRY_CONFIGURATION_ARGUMENTS_INVALID');
  const input: unknown = JSON.parse(bytes.toString('utf8'));
  await configureRegistryDeployment(input, templateRoot);
  return '{"configured":true}\n';
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 2)
      throw new Error('REGISTRY_CONFIGURATION_ARGUMENTS_INVALID');
    const bytes = readFileSync(0);
    process.stdout.write(await runRegistryConfigure(bytes));
  } catch {
    process.stderr.write('REGISTRY_CONFIGURATION_FAILED\n');
    process.exitCode = 1;
  }
}
