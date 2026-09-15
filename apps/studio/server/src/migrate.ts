import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { migrateDatabase, type SchemaDdl } from './db/migrate.ts';
import { createOwnerPool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { STUDIO_VERSION } from './version.ts';

// The image's third entry: `studio-api migrate`, the one-shot that creates the
// schema (#1909). It runs once per deployment, never per replica, which is why
// it is a command and not boot work — the web process and the worker only
// verify the fingerprint (src/boot.ts).
//
// It connects as the login in DATABASE_URL rather than as either pinned role:
// the statements create those roles, so the login needs `CREATEROLE` the first
// time, exactly as `apply-schema` documents for a repository checkout.

const env = readEnv();

if (!env.db) {
  // oxlint-disable-next-line no-console -- command diagnostics
  console.error(
    'DATABASE_URL is required for migrate: there is no database to create the schema in.',
  );
  process.exit(1);
}

// oxlint-disable-next-line no-console -- command output
console.log(`Network Canvas Studio migrate ${STUDIO_VERSION}`);

/**
 * Written by `scripts/render-schema-ddl.ts` after `vite build`, so it sits
 * beside the emitted `dist/migrate.js` — read through `import.meta.url` rather
 * than the working directory, which a container runtime may set to anything.
 */
const ddl = JSON.parse(
  await readFile(new URL('./schema-ddl.json', import.meta.url), 'utf8'),
) as SchemaDdl;

const pool = createOwnerPool(env.db);
try {
  await migrateDatabase(pool, ddl, {
    // oxlint-disable-next-line no-console -- command output
    log: (line) => console.log(line),
  });
} catch (error) {
  // oxlint-disable-next-line no-console -- command diagnostics
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
