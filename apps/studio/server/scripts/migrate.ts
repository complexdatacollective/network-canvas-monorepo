import { fileURLToPath } from 'node:url';

import { runMigrations } from '../src/db/migrate.ts';
import { createPool } from '../src/db/pool.ts';
import { readEnv } from '../src/env.ts';

// src/index.ts applies migrations at every boot. A serverless deployment has
// no boot, so the same idempotent step runs here instead: `build:netlify`
// runs it against the Netlify-injected DATABASE_URL before bundling, and
// `pnpm db:migrate` runs it manually against whatever DATABASE_URL points at.

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to migrate.');
  process.exit(1);
}

const pool = createPool(env.db);

try {
  await runMigrations(
    pool,
    fileURLToPath(new URL('../drizzle', import.meta.url)),
  );
  console.log('Database migrations applied.');
} finally {
  await pool.end();
}
