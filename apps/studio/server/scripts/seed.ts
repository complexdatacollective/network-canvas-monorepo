import process from 'node:process';
import { parseArgs } from 'node:util';

import { createOwnerPool } from '../src/db/pool.ts';
import { checkSchema, schemaProblemMessage } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';
import { readEnv } from '../src/env.ts';
import { confirmDestructiveTarget } from './target-guard.ts';

// The deploy-time seed step, run once per deployment rather than once per
// replica (see apps/studio/README.md#database-schema-and-seeding). It wipes
// existing data and repopulates synthetic demo content, so — like
// db-reset.ts — it refuses a non-local database unless --force and a
// per-instance admin password make that an explicit, deliberate choice.

const { values } = parseArgs({
  options: { force: { type: 'boolean', default: false } },
});

const env = readEnv();
const { db } = confirmDestructiveTarget(env, values.force, 'wipe and reseed');

const pool = createOwnerPool(db);

try {
  const state = await checkSchema(pool);
  if (state.kind !== 'current') {
    console.error(schemaProblemMessage(state));
    process.exit(1);
  }
  await seed(pool, { adminPassword: env.seedAdminPassword });
  console.log('Seed complete.');
} finally {
  await pool.end();
}
