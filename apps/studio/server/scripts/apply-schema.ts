import { createPool } from '../src/db/pool.ts';
import { applyAuthSchema } from '../src/db/schema.ts';
import { readEnv } from '../src/env.ts';

// src/index.ts applies the auth schema at every boot. A serverless deployment
// has no boot, so the same idempotent step runs here, out of band, against
// whatever DATABASE_URL points at.

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to apply to.');
  process.exit(1);
}

const pool = createPool(env.db);

try {
  await applyAuthSchema(pool);
  console.log('Auth schema applied.');
} finally {
  await pool.end();
}
