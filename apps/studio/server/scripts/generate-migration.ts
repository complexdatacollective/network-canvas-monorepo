import { fileURLToPath } from 'node:url';

import {
  generatePostgresMigrationFiles,
  readMigrationAuthoringOptions,
} from '@codaco/studio-sync/postgres-migration-authoring';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import { SCHEMA, SIDECARS } from '../src/db/schema.ts';

/** Studio's schema and paths; the shared authoring engine preserves history. */
export function generateMigrationFiles(options: {
  root: string;
  name: string;
  before?: string;
  after?: string;
}): Promise<{ id: string; statements: number }> {
  return generatePostgresMigrationFiles({
    applicationName: 'Studio',
    schema: SCHEMA,
    sidecarStatements: SIDECARS,
    expectedFingerprint: SCHEMA_FINGERPRINT,
    ...options,
  });
}

if (import.meta.main) {
  const result = await generateMigrationFiles({
    root: fileURLToPath(new URL('../migrations', import.meta.url)),
    ...(await readMigrationAuthoringOptions(process.argv.slice(2))),
  });
  console.log(
    `Generated ${result.id}: ${result.statements} Drizzle statements plus the ordered sidecar snapshot. Review the SQL and run the migration tests before committing.`,
  );
}
