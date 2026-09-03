import process from 'node:process';
import { parseArgs } from 'node:util';

import { createOwnerPool } from '../src/db/pool.ts';
import { checkSchema, schemaProblemMessage } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';
import { isLocalDatabase, readEnv } from '../src/env.ts';

// The deploy-time seed step, run once per deployment rather than once per
// replica (see apps/studio/README.md#database-schema-and-seeding). It wipes
// existing data and repopulates synthetic demo content, so — like
// db-reset.ts — it refuses a non-local database unless --force makes that an
// explicit, deliberate choice for this deployment.

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to seed.');
  process.exit(1);
}

if (!isLocalDatabase(env.db.url) && !values.force) {
  const url = new URL(env.db.url);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  console.error(
    `Refusing to wipe and reseed ${target} with synthetic data: it is not a local database. Pass --force to do it anyway.`,
  );
  process.exit(1);
}

const pool = createOwnerPool(env.db);

try {
  const state = await checkSchema(pool);
  if (state.kind !== 'current') {
    console.error(schemaProblemMessage(state));
    process.exit(1);
  }
  await seed(pool);
  console.log('Seed complete.');
} finally {
  await pool.end();
}
