import process from 'node:process';

import { createMaintenancePool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { rotateSecrets as rotate } from './secrets/rotate.ts';

/* oxlint-disable no-console -- a command-line entry writes to the terminal */

// The rotation entry: the same image as src/index.ts and src/worker.ts,
// started with a different command (#1900). It re-encrypts every stored secret
// under the keyring's current entry, runs to completion and exits — nothing
// here serves a request or executes a job.
//
// Its own bundle entry, because the image's entrypoint is the `studio-api`
// script (#1909), which names each of the three by the file it runs. Running
// one therefore evaluates only what it needs: this process never loads the
// HTTP app or the job worker, and the web process never reaches the rotation,
// which a source-policy test pins
// (src/__tests__/process-separation.test.ts).

/**
 * Reads the environment for a command rather than a server: a refusal here is
 * a message for whoever typed the command, not a stack trace.
 */
function readEnvOrExit() {
  try {
    return readEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Read into locals so the guards below narrow them for the call.
const { db, secrets } = readEnvOrExit();
if (!db) {
  console.error(
    'DATABASE_URL is not set; there are no stored secrets to re-encrypt.',
  );
  process.exit(1);
}
if (!secrets) {
  // `resolve` refuses a database with no keyring, so this cannot be reached
  // by a configuration; it keeps the narrowing honest.
  console.error(
    'No secrets keyring is configured; set STUDIO_SECRETS_KEY_FILE or STUDIO_SECRETS_KEY.',
  );
  process.exit(1);
}

// The cross-team identity, because rotation must visit every team's rows and
// the tenant tables force row-level security on every other role.
const pool = createMaintenancePool(db);
try {
  const counts = await rotate(pool, secrets, {
    log: (message) => console.log(message),
  });
  for (const [store, rotated] of Object.entries(counts)) {
    console.log(`${store}: ${rotated} re-sealed`);
  }
  console.log(
    `Every stored secret is now under key id "${secrets.currentId}". ` +
      'The older entries can be removed from the keyring once its backup is updated.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  // Not `process.exit`: the pool is ended below first, so a rotation that
  // refused does not leave connections for the database to time out.
  process.exitCode = 1;
} finally {
  await pool.end();
}
