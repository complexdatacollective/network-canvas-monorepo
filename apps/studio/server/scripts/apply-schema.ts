import { createOwnerPool } from '../src/db/pool.ts';
import { readEnv } from '../src/env.ts';
import {
  issueBootstrapToken,
  printBootstrapToken,
} from '../src/setup/bootstrap.ts';
import { applySchema } from './apply.ts';

// The server only verifies; this is the application step for every lane, run
// once against whatever DATABASE_URL points at.

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to apply to.');
  process.exit(1);
}

const pool = createOwnerPool(env.db);

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
  // First-run bootstrap (#1909). After the schema, because the row it writes
  // is part of it, and on every run, because an ownerless instance whose token
  // was lost is recovered by running this again. An owned instance issues
  // nothing and prints nothing.
  printBootstrapToken(await issueBootstrapToken(pool), env.auth?.baseUrl);
} finally {
  await pool.end();
}
