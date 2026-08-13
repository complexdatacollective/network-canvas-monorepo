import { parseArgs } from 'node:util';

import { createPool } from '../src/db/pool.ts';
import { ensureSchema, staleSchemaMessage } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';
import { readEnv } from '../src/env.ts';

// The remedy the fingerprint guard names: drop everything, rebuild from the
// current schema, seed. Pre-release a schema change means recreating the
// database rather than migrating it (see src/db/schema.ts).
//
// It drops the schema rather than the database — unlike packages/studio-sync's
// test helper — so it needs no second connection to the maintenance database
// and no privilege to drop a database that has connections open. The same
// command therefore works against a managed Postgres.

const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to reset.');
  process.exit(1);
}

// The connection string is what gets destroyed, so it is what decides whether
// this needs confirming — not NODE_ENV, which is `production` on previews too.
const url = new URL(env.db.url);
const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;

if (!LOOPBACK.has(url.hostname) && !values.force) {
  console.error(
    `Refusing to reset ${target}: it is not a local database. Pass --force to reset it anyway.`,
  );
  process.exit(1);
}

console.log(`Resetting ${target}`);

const pool = createPool(env.db);

try {
  await pool.query('drop schema if exists public cascade');
  await pool.query('create schema public');

  const state = await ensureSchema(pool);
  if (state.kind === 'stale') {
    console.error(staleSchemaMessage(state));
    process.exit(1);
  }

  await seed(pool);
  console.log('Database reset.');
} finally {
  await pool.end();
}
