import { createPool } from '../src/db/pool.ts';
import { ensureSchema, staleSchemaMessage } from '../src/db/schema.ts';
import { seed } from '../src/db/seed.ts';
import { readEnv } from '../src/env.ts';

// The deploy-time seed step, run once per deployment rather than once per
// replica.

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to seed.');
  process.exit(1);
}

const pool = createPool(env.db);

try {
  const state = await ensureSchema(pool);
  if (state.kind === 'stale') {
    console.error(staleSchemaMessage(state));
    process.exit(1);
  }
  await seed(pool);
  console.log('Seed complete.');
} finally {
  await pool.end();
}
