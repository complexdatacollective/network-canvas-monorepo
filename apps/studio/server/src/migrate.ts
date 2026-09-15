import { readFile } from 'node:fs/promises';

import { migrateDatabase, type SchemaDdl } from './db/migrate.ts';
import { createOwnerPool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { verifySecretKeysOrExit } from './secrets/boot.ts';
import { issueBootstrapToken, printBootstrapToken } from './setup/bootstrap.ts';
import { STUDIO_VERSION } from './version.ts';

// The image's third entry: `studio-api migrate`, the one-shot that creates the
// schema (#1909). It runs once per deployment, never per replica, which is why
// it is a command and not boot work — the web process and the worker only
// verify the fingerprint (src/boot.ts).
//
// It connects as the login in DATABASE_URL rather than as either pinned role:
// the statements create those roles, so the login needs `CREATEROLE` the first
// time, exactly as `apply-schema` documents for a repository checkout.

const env = readEnv();

if (!env.db) {
  // oxlint-disable-next-line no-console -- command diagnostics
  console.error(
    'DATABASE_URL is required for migrate: there is no database to create the schema in.',
  );
  process.exit(1);
}

// oxlint-disable-next-line no-console -- command output
console.log(`Network Canvas Studio migrate ${STUDIO_VERSION}`);

/**
 * Written by `scripts/render-schema-ddl.ts` after `vite build`, so it sits
 * beside the emitted `dist/migrate.js` — read through `import.meta.url` rather
 * than the working directory, which a container runtime may set to anything.
 */
const ddl = JSON.parse(
  await readFile(new URL('./schema-ddl.json', import.meta.url), 'utf8'),
) as SchemaDdl;

const pool = createOwnerPool(env.db);
try {
  await migrateDatabase(pool, ddl, {
    // oxlint-disable-next-line no-console -- command output
    log: (line) => console.log(line),
  });
  // After the schema, before anything runs against it (#1900): the check
  // `apply-schema` runs in a checkout, so a database restored from a backup
  // that does not match the keyring is caught by the command an operator ran
  // by hand, with the output in front of them, rather than by the next
  // container start. `readEnv` above already refused to run without a
  // keyring at all. Before the bootstrap token, so a refused database never
  // prints a token nobody should use.
  await verifySecretKeysOrExit(env);
  // oxlint-disable-next-line no-console -- command output
  console.log('Stored secrets are readable with the configured keyring.');
  // First-run bootstrap (#1909): on a database nobody owns yet, issue the
  // token `/setup` spends and print it once — rotating any earlier one, so a
  // lost token is recovered by running this again. An owned instance issues
  // nothing and prints nothing. After `migrateDatabase`, on the pool: the
  // installation table exists only once its transaction has committed.
  printBootstrapToken(await issueBootstrapToken(pool), env.auth?.baseUrl);
} catch (error) {
  // oxlint-disable-next-line no-console -- command diagnostics
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
