import process from 'node:process';

/* oxlint-disable no-console -- a command-line interface writes to the terminal */

// `studio-api`: the image's entrypoint, and the one place the deployable's
// commands are named (#1900). One image, three things to run — the web
// process, the worker, and the rotation — so a deployment writes
// `docker run … worker` rather than a path into a bundle whose layout is ours
// to change.
//
// Every command is loaded dynamically, so running one evaluates only what it
// needs: `serve` never loads the rotation, and `rotate-secrets` never loads
// the HTTP app. The static half of that separation is pinned in
// src/__tests__/process-separation.test.ts.

const USAGE = `Usage: studio-api <command>

  serve            Serve the API, the RPC surface and the app WebSocket (default)
  worker           Run background jobs and scheduled work
  rotate-secrets   Re-encrypt every stored secret under the current keyring entry
`;

/**
 * Reads the environment for a command rather than a server: a refusal here is
 * a message for whoever typed the command, not a stack trace.
 */
async function readEnvOrExit() {
  const { readEnv } = await import('./env.ts');
  try {
    return readEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function rotateSecrets(): Promise<void> {
  const env = await readEnvOrExit();
  if (!env.db) {
    console.error(
      'DATABASE_URL is not set; there are no stored secrets to re-encrypt.',
    );
    process.exit(1);
  }
  if (!env.secrets) {
    // `resolve` refuses a database with no keyring, so this cannot be reached
    // by a configuration; it keeps the narrowing honest.
    console.error(
      'No secrets keyring is configured; set STUDIO_SECRETS_KEY_FILE or STUDIO_SECRETS_KEY.',
    );
    process.exit(1);
  }

  const [{ createMaintenancePool }, { rotateSecrets: rotate }] =
    await Promise.all([import('./db/pool.ts'), import('./secrets/rotate.ts')]);
  // The cross-team identity, because rotation must visit every team's rows and
  // the tenant tables force row-level security on every other role.
  const pool = createMaintenancePool(env.db);
  try {
    const counts = await rotate(pool, env.secrets, {
      log: (message) => console.log(message),
    });
    for (const [store, rotated] of Object.entries(counts)) {
      console.log(`${store}: ${rotated} re-sealed`);
    }
    console.log(
      `Every stored secret is now under key id "${env.secrets.currentId}". ` +
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
}

// `serve` by default, so the image's CMD is a word rather than a requirement.
const command = process.argv[2] ?? 'serve';

switch (command) {
  case 'serve':
    await import('./index.ts');
    break;
  case 'worker':
    await import('./worker.ts');
    break;
  case 'rotate-secrets':
    await rotateSecrets();
    break;
  default:
    console.error(`Unknown command: ${command}\n\n${USAGE}`);
    // Distinct from 1, which every command uses to mean it refused to do its
    // work: 2 is "there is no such command", and a deployment's healthcheck or
    // CI can tell the two apart.
    process.exit(2);
}
