import { createPool } from '../src/db/pool.ts';
import { readEnv } from '../src/env.ts';
import { applySchema } from './apply.ts';

// The server only verifies; this is the application step for every lane, run
// once against whatever DATABASE_URL points at.

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to apply to.');
  process.exit(1);
}

const pool = createPool(env.db);

try {
  const outcome = await applySchema(pool);
  for (const { hint, statement } of outcome.hints) {
    console.warn(`hint: ${hint}${statement ? `\n  ${statement}` : ''}`);
  }
  if (outcome.statements.length === 0) {
    console.log('Schema already current.');
  } else {
    for (const statement of outcome.statements) {
      console.log(statement);
    }
    console.log(`Schema applied (${outcome.statements.length} statements).`);
  }
} finally {
  await pool.end();
}
