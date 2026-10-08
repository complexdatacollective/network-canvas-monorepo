import { Cause, Effect, Exit } from 'effect';

import { OwnerDatabase } from '../src/db/client.ts';
import { createOwnerPool } from '../src/db/pool.ts';
import { OwnerScope } from '../src/db/tenant.ts';
import { Environment, readEnv } from '../src/env.ts';
import { SecretsCipher } from '../src/secrets/services.ts';
import { verifyKeyring } from '../src/secrets/verify.ts';
import {
  issueBootstrapToken,
  printBootstrapToken,
} from '../src/setup/bootstrap.ts';
import { applySchema, MigratedDatabaseRefused } from './apply.ts';

// The checkout lane's push: development databases and test fixtures only. A
// database carrying migration history is refused, naming `migrate` (#1901).

const env = readEnv();

if (!env.db) {
  console.error('DATABASE_URL is not set; there is no database to apply to.');
  process.exit(1);
}

const pool = createOwnerPool(env.db);

try {
  const outcome = await applySchema(pool).catch(async (error: unknown) => {
    // A refusal, not a crash: print the remedy alone.
    if (!(error instanceof MigratedDatabaseRefused)) throw error;
    console.error(error.message);
    await pool.end();
    process.exit(1);
  });
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
  // After the schema, before anything runs against it (#1900): a database
  // restored from a backup that does not match the keyring is caught by the
  // command an operator runs by hand, with the output still in front of them,
  // rather than by the next container start. `readEnv` above has already
  // refused to run at all without a keyring, which is the other half of the
  // rule: back it up with the database, because without it every stored secret
  // is unreadable. Before the bootstrap token, so a refused database never
  // prints a token nobody should use.
  const verified = await Effect.runPromiseExit(
    verifyKeyring.pipe(
      Effect.provide(SecretsCipher.layerFromEnvironment),
      Effect.provideService(Environment)(env),
    ),
  );
  if (Exit.isFailure(verified)) {
    const failure: unknown = Cause.squash(verified.cause);
    console.error(failure instanceof Error ? failure.message : String(failure));
    process.exit(1);
  }
  console.log('Stored secrets are readable with the configured keyring.');
  // First-run bootstrap (#1909). After the schema, because the row it writes
  // is part of it, and on every run, because an ownerless instance whose token
  // was lost is recovered by running this again. An owned instance issues
  // nothing and prints nothing.
  printBootstrapToken(
    await Effect.runPromise(
      OwnerScope.open(issueBootstrapToken()).pipe(
        Effect.provide(OwnerDatabase.layer(env.db)),
        Effect.scoped,
      ),
    ),
    env.auth?.baseUrl,
  );
} finally {
  await pool.end();
}
