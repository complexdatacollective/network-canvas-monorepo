/* oxlint-disable no-console -- dev tooling log output */

/*
 * The development lane's backing services (#1909). They are the services the
 * reference stack ships — `../../docker-compose.yml` with
 * `../../docker-compose.dev.yml` over it, which publishes them on the host
 * loopback and adds a mail sink — rather than the hand-rolled `docker run`
 * containers this replaces. A developer therefore runs Postgres, Garage,
 * Valkey and Mailpit exactly as a deployment runs them, and a change to the
 * stack is felt here before it is felt by a self-hoster.
 *
 * `traefik`, `web`, `api` and `worker` stay stopped: in development those run
 * from source under watch, with the client's HMR.
 *
 * `pnpm dev` runs this twice. `--prepare` brings the services up, bootstraps
 * the bucket, resets and seeds the database, and exits; only then does
 * `concurrently` start the server, the worker, the client and this script
 * again as `--follow`, which tails the containers' logs and touches nothing.
 * The split is what keeps the reset ahead of the server: started side by side,
 * a server whose last build's schema was still current would verify the
 * fingerprint, start its delivery workers and begin answering requests, and
 * the drop and reseed would then land under it.
 */

import { spawnSync } from 'node:child_process';
import process from 'node:process';

import { createOwnerPool } from '../src/db/pool.ts';
import { isLocalDatabase, readEnv } from '../src/env.ts';
import { DEV } from '../src/env/development.ts';
import { resetSchemaAndSeed } from './apply.ts';
import {
  composeFile,
  createCompose,
  devComposeFile,
  writeSecretsIfAbsent,
} from './compose.ts';
import { loadEnvFiles } from './load-env-files.ts';

// Named so it cannot collide with a production-shaped stack run from the same
// checkout, which uses the compose file's own project name.
const PROJECT = 'studio-dev';

// The services the development lane runs. The rest of the stack is the same
// file's, and stays stopped.
const SERVICES = ['postgres', 'garage', 'valkey', 'mailpit'];

/**
 * Everything `../../docker-compose.yml` interpolates. Compose validates the
 * whole model before selecting services, so the variables of the services the
 * development lane never starts have to be set too — with values that make it
 * obvious they were never used.
 *
 * The development stack's own values come from the `DEV` constants, which
 * `.env.development` is also generated from, so the containers and the
 * server's configuration cannot drift apart.
 */
function composeEnvironment(): Record<string, string> {
  return {
    // Not started here; present because Compose validates every service.
    STUDIO_HOSTNAME: 'studio.invalid',
    ACME_EMAIL: 'nobody@studio.invalid',
    STUDIO_API_IMAGE: 'studio-api:not-used-in-development',
    STUDIO_WEB_IMAGE: 'studio-web:not-used-in-development',
    BETTER_AUTH_SECRET: DEV.authSecret,
    SMTP_URL: '',
    EMAIL_FROM: '',

    // A different subnet from the example's, so a production-shaped stack can
    // be brought up on this machine beside the development one.
    STACK_SUBNET: '172.31.241.0/24',

    POSTGRES_USER: DEV.pgUser,
    POSTGRES_DB: DEV.pgDatabase,

    S3_REGION: DEV.s3Region,
    S3_BUCKET: DEV.s3Bucket,
    S3_ACCESS_KEY_ID: DEV.s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: DEV.s3SecretAccessKey,
    GARAGE_RPC_SECRET: DEV.garageRpcSecret,
    GARAGE_ADMIN_TOKEN: DEV.garageAdminToken,
  };
}

const compose = createCompose({
  project: PROJECT,
  files: [composeFile, devComposeFile],
  // Compose reads no `.env` of its own here: everything it interpolates is in
  // this environment, so what the containers get is what `DEV` says.
  environment: composeEnvironment(),
});

/**
 * The containers this script replaces (`dev-pg`, `dev-s3`) were branch-scoped
 * and long-lived, so one left running from an earlier session still holds the
 * fixed ports the compose stack wants. Stopped rather than removed: they are
 * not this script's to delete, and a stopped container gives its ports up.
 * Nothing durable is lost — the database they hold is reset on every boot.
 */
function stopSupersededContainers(): string[] {
  const listed = spawnSync(
    'docker',
    [
      'ps',
      '--filter',
      'name=^/studio-dev-pg-',
      '--filter',
      'name=^/studio-dev-minio-',
      '--format',
      '{{.Names}}',
    ],
    { encoding: 'utf8' },
  );
  const names = (listed.stdout ?? '')
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  const stopped: string[] = [];
  for (const name of names) {
    const result = spawnSync('docker', ['stop', name], { encoding: 'utf8' });
    if (result.status === 0) stopped.push(name);
  }
  return stopped;
}

function up(): void {
  console.log(`Starting ${SERVICES.join(', ')} [project: ${PROJECT}]...`);
  let result = compose.run(['up', '-d', '--wait', ...SERVICES]);
  if (result.status !== 0) {
    const stopped = stopSupersededContainers();
    if (stopped.length === 0) {
      throw new Error(`docker compose up failed:\n${result.stderr}`);
    }
    console.log(
      `Stopped ${stopped.join(', ')} — containers from the dev scripts this stack replaces, which still held its ports. Retrying.`,
    );
    result = compose.run(['up', '-d', '--wait', ...SERVICES]);
    if (result.status !== 0) {
      throw new Error(`docker compose up failed:\n${result.stderr}`);
    }
  }
}

/** The layout, the access key, the bucket and its grant. Idempotent. */
function bootstrapObjectStore(): void {
  const result = compose.run(['run', '--rm', 'garage-init']);
  if (result.status !== 0) {
    throw new Error(`garage-init failed:\n${result.stderr}`);
  }
}

// Every `pnpm dev` boot starts from a clean, freshly seeded database: Studio
// has no real users yet, so reproducible synthetic data (scripts/seed/) beats
// whatever was left over from the last session. The target is the database the
// server process will connect to — the same files, in the same order, so a
// `.env` override of DATABASE_URL is reset and seeded rather than the default
// it replaced. Resetting without asking is safe only for a database on this
// machine, the guard db-reset.ts applies before a manual reset touches
// anything else; a non-local target is left alone.
async function resetAndSeed(): Promise<void> {
  loadEnvFiles();
  const { db, secrets } = readEnv();
  if (!db) throw new Error('DATABASE_URL is unset; nothing to reset.');
  // Unreachable once `db` is present — `resolve()` refuses a DATABASE_URL with
  // no keyring (#1900) — but narrowed rather than asserted, for the same
  // reason `db` is: the seed seals real webhook secrets with it.
  if (!secrets) {
    throw new Error(
      'No secrets keyring is configured; the seed cannot seal the secrets it writes.',
    );
  }
  const url = new URL(db.url);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  if (!isLocalDatabase(db.url)) {
    console.log(
      `DATABASE_URL points at ${target}, which is not on this machine; leaving it as it is. Reset it deliberately with: pnpm db:reset --force`,
    );
    return;
  }
  const pool = createOwnerPool(db);
  try {
    // The database this resets is local by construction, so the seed can
    // take the pinned PRNG's nonces and write the same rows every boot.
    await resetSchemaAndSeed(pool, db, { secrets, reproducible: true });
    console.log(`Reset and seeded ${target}`);
  } finally {
    await pool.end();
  }
}

function followLogs(): void {
  const child = compose.start(['logs', '-f', ...SERVICES]);

  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!child.killed) child.kill('SIGTERM');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    process.exit(code ?? 0);
  });
}

function down(removeVolumes: boolean): void {
  const result = compose.run(['down', ...(removeVolumes ? ['--volumes'] : [])]);
  if (result.status !== 0) {
    throw new Error(`docker compose down failed:\n${result.stderr}`);
  }
}

type Mode = 'prepare' | 'follow' | 'down' | 'both';

function modeFromArgs(argv: readonly string[]): Mode {
  if (argv.includes('--down')) return 'down';
  if (argv.includes('--prepare')) return 'prepare';
  if (argv.includes('--follow')) return 'follow';
  return 'both';
}

async function main(argv: readonly string[]): Promise<void> {
  const mode = modeFromArgs(argv);

  if (mode === 'down') {
    const removeVolumes = argv.includes('--volumes') || argv.includes('-v');
    down(removeVolumes);
    console.log(
      removeVolumes
        ? 'Stopped the development stack and removed its volumes.'
        : 'Stopped the development stack. Its volumes are kept; add --volumes to wipe them.',
    );
    return;
  }

  writeSecretsIfAbsent();

  if (mode === 'follow') {
    followLogs();
    return;
  }

  up();
  bootstrapObjectStore();
  await resetAndSeed();
  console.log(
    [
      `Postgres      127.0.0.1:${DEV.pgPort}  database '${DEV.pgDatabase}'`,
      `Garage (S3)   127.0.0.1:${DEV.s3Port}  bucket '${DEV.s3Bucket}'`,
      `Valkey        127.0.0.1:${DEV.valkeyPort}`,
      `Mailpit       127.0.0.1:${DEV.smtpPort} (SMTP), http://localhost:${DEV.mailpitUiPort} (inbox)`,
    ].join('\n'),
  );
  if (mode === 'prepare') return;
  followLogs();
}

await main(process.argv.slice(2));
