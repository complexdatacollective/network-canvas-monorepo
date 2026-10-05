import { writeFile } from 'node:fs/promises';
import process from 'node:process';

import { SCHEMA_FINGERPRINT } from '../src/db/fingerprint.generated.ts';
import type { SchemaDdl } from '../src/db/migrate.ts';
import { fingerprintOfDdl } from '../src/db/migrate.ts';
import { renderJobStatements, renderSchemaStatements } from './apply.ts';

// Renders the schema this build describes into `dist/schema-ddl.json`, which
// is what `studio-api migrate` executes (#1909). Run from the server's `build`
// script AFTER `vite build`, which empties `dist`.
//
// The rendering needs drizzle-kit, which is why it happens here at build time
// rather than in the image: nothing under `src/` may import it, and the image
// installs production dependencies only.

export async function renderSchemaDdl(): Promise<SchemaDdl> {
  const statements = await renderSchemaStatements();
  const jobStatements = renderJobStatements();
  const ddl: SchemaDdl = {
    fingerprint: SCHEMA_FINGERPRINT,
    statements,
    jobStatements,
  };

  const rendered = fingerprintOfDdl(ddl);
  if (rendered !== SCHEMA_FINGERPRINT) {
    throw new Error(
      'src/db/fingerprint.generated.ts does not match the schema definitions; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    );
  }
  return ddl;
}

// `import.meta.main` rather than an unconditional call, so the render function
// above stays importable by the test that proves it round-trips.
if (import.meta.main) {
  const target = new URL('../dist/schema-ddl.json', import.meta.url);
  const ddl = await renderSchemaDdl();
  await writeFile(target, JSON.stringify(ddl));
  // oxlint-disable-next-line no-console -- build output
  console.log(
    `Rendered ${ddl.statements.length} schema statement(s) to dist/schema-ddl.json (${SCHEMA_FINGERPRINT.slice(0, 12)}).`,
  );
  // drizzle-kit's esbuild service keeps the loop alive.
  process.exit(0);
}
