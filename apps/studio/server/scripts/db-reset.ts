import { existsSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createPool } from '../src/db/pool.ts';
import { ensureSchema, staleSchemaMessage } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';
import { isLocalDatabase, readEnv } from '../src/env.ts';

// The remedy the fingerprint guard names: drop everything, rebuild from the
// current schema, seed. Pre-release a schema change means recreating the
// database rather than migrating it (see src/db/schema.ts).
//
// It drops the schema rather than the database — unlike packages/studio-sync's
// test helper — so it needs no second connection to the maintenance database
// and no privilege to drop a database that has connections open. The same
// command therefore works against a managed Postgres.

// This script loads its own environment rather than taking `--env-file`
// flags, because which files apply depends on what it finds. `.env` is read
// first and decides: the committed development defaults join it only for a
// local target, so a `--force` reset of a managed database is never handed
// the development marker and the publicly-known credentials it licenses. A
// developer whose `.env` points at their own local Postgres still gets the
// rest of the development lane, and so does a plain `pnpm dev` checkout with
// no `.env` at all.
function loadEnvFiles(): void {
  const file = (name: string) =>
    fileURLToPath(new URL(`../${name}`, import.meta.url));
  if (existsSync(file('.env'))) process.loadEnvFile(file('.env'));
  const target = process.env.DATABASE_URL;
  if (
    (!target || isLocalDatabase(target)) &&
    existsSync(file('.env.development'))
  ) {
    process.loadEnvFile(file('.env.development'));
  }
}

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});

loadEnvFiles();

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to reset.');
  process.exit(1);
}

// The connection string is what gets destroyed, so it is what decides whether
// this needs confirming — not NODE_ENV, which is `production` on previews too.
const url = new URL(env.db.url);
const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;

if (!isLocalDatabase(env.db.url) && !values.force) {
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
