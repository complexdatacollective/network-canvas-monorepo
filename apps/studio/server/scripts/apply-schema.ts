import { createPool } from '../src/db/pool.ts';
import { ensureSchema, staleSchemaMessage } from '../src/db/schema.ts';
import { readEnv } from '../src/env.ts';

// src/index.ts applies the schema at every boot. A serverless deployment has
// no boot, so the same step runs here, out of band, against whatever
// DATABASE_URL points at. On that lane this is also the only place a stale
// schema is ever detected.

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to apply to.');
  process.exit(1);
}

const pool = createPool(env.db);

try {
  const state = await ensureSchema(pool);
  if (state.kind === 'stale') {
    console.error(staleSchemaMessage(state));
    process.exit(1);
  }
  console.log(
    state.kind === 'created' ? 'Schema applied.' : 'Schema already current.',
  );
} finally {
  await pool.end();
}
