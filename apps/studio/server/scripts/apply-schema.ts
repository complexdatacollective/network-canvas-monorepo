import { createOwnerPool } from '../src/db/pool.ts';
import { readEnv } from '../src/env.ts';
import { verifySecretKeysOrExit } from '../src/secrets/boot.ts';
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
} finally {
  await pool.end();
}

// After the schema, before anything runs against it (#1900): a database
// restored from a backup that does not match the keyring is caught by the
// command an operator runs by hand, with the output still in front of them,
// rather than by the next container start. `readEnv` above has already refused
// to run at all without a keyring, which is the other half of the rule: back
// it up with the database, because without it every stored secret is
// unreadable.
await verifySecretKeysOrExit(env);
console.log('Stored secrets are readable with the configured keyring.');
