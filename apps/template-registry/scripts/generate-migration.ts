import { fileURLToPath } from 'node:url';

import {
  generatePostgresMigrationFiles,
  readMigrationAuthoringOptions,
} from '@codaco/studio-sync/postgres-migration-authoring';

import { REGISTRY_SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import { REGISTRY_TABLES, REGISTRY_SIDECARS } from '../src/db/schema.ts';

export function generateRegistryMigrationFiles(options: {
  root: string;
  name: string;
  before?: string;
  after?: string;
}) {
  return generatePostgresMigrationFiles({
    applicationName: 'Template Registry',
    schema: REGISTRY_TABLES,
    sidecarStatements: REGISTRY_SIDECARS,
    expectedFingerprint: REGISTRY_SCHEMA_FINGERPRINT,
    ...options,
  });
}

if (import.meta.main)
  await generateRegistryMigrationFiles({
    root: fileURLToPath(new URL('../migrations', import.meta.url)),
    ...(await readMigrationAuthoringOptions(process.argv.slice(2))),
  });
