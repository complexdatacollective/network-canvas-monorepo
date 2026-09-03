// The port and credentials deliberately match packages/studio-sync's
// conformance-suite expectations, so one container serves the app and that
// suite.
//
// `pnpm dev` runs this twice. `--prepare` brings Postgres up, resets and
// seeds it, and exits; only then does `concurrently` start the server, the S3
// sidecar and this script again as `--follow`, which tails the container's
// logs for the life of the session and touches nothing. The split is what
// keeps the reset ahead of the server: started side by side, a server whose
// last build's schema was still current would verify the fingerprint, start
// its delivery workers and begin answering requests, and the drop and reseed
// would then land under it — transient failures for whoever was already
// signed in, and a worker leasing rows that were about to be truncated. Run
// with neither flag, it does both in order, for anyone driving it by hand.
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

import pg from 'pg';

import { createOwnerPool } from '../src/db/pool.ts';
import { isLocalDatabase, readEnv } from '../src/env.ts';
import { DEV } from '../src/env/catalogue.ts';
import { resetSchemaAndSeed } from './apply.ts';
import { loadEnvFiles } from './load-env-files.ts';

const IMAGE = 'postgres:18';
const HOST_PORT = DEV.pgPort;
const CONTAINER_PORT = 5432;
const USER = DEV.pgUser;
const PASSWORD = DEV.pgPassword;
const DATABASE = DEV.pgDatabase;
const READY_MAX_ATTEMPTS = 30;
const READY_INTERVAL_MS = 1000;

const branch =
  (
    spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).stdout ?? ''
  ).trim() || 'default';

const safeBranch = branch
  .toLowerCase()
  .replaceAll('/', '-')
  .replace(/[^a-z0-9-]/g, '');

const containerName = `studio-dev-pg-${safeBranch}`;
const volumeName = `studio-dev-pg-${safeBranch}`;

function docker(args: string[]): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function containerExists(): boolean {
  return docker(['container', 'inspect', containerName]).status === 0;
}

function containerIsRunning(): boolean {
  const result = docker(['inspect', '-f', '{{.State.Running}}', containerName]);
  return result.status === 0 && result.stdout.trim() === 'true';
}

function ensureVolume(): void {
  const inspect = docker(['volume', 'inspect', volumeName]);
  if (inspect.status === 0) return;
  const create = docker(['volume', 'create', volumeName]);
  if (create.status !== 0) {
    throw new Error(`docker volume create failed: ${create.stderr}`);
  }
}

function removeContainer(): void {
  const result = docker(['rm', '-f', containerName]);
  if (result.status === 0) return;
  // Tolerate "already gone" races with parallel invocations.
  if (result.stderr.toLowerCase().includes('no such container')) return;
  throw new Error(`docker rm -f failed: ${result.stderr}`);
}

function startContainer(): void {
  console.log(`Starting Postgres on port ${HOST_PORT} [branch: ${branch}]...`);
  const result = docker([
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-p',
    `${HOST_PORT}:${CONTAINER_PORT}`,
    '-v',
    // The postgres:18 image moved PGDATA below /var/lib/postgresql; mounting
    // the parent is the image's supported persistence path.
    `${volumeName}:/var/lib/postgresql`,
    '-e',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    IMAGE,
  ]);
  if (result.status !== 0) {
    throw new Error(`docker run failed: ${result.stderr}`);
  }
}

async function query(
  sql: string,
  values: unknown[] = [],
  database = 'postgres',
): Promise<pg.QueryResult> {
  const client = new pg.Client({
    host: '127.0.0.1',
    port: HOST_PORT,
    user: USER,
    password: PASSWORD,
    database,
    connectionTimeoutMillis: 2000,
  });
  await client.connect();
  try {
    return await client.query(sql, values);
  } finally {
    await client.end();
  }
}

async function postgresReachable(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function waitForReady(): Promise<void> {
  for (let attempt = 1; attempt <= READY_MAX_ATTEMPTS; attempt++) {
    if (await postgresReachable()) return;
    await new Promise((resolve) => setTimeout(resolve, READY_INTERVAL_MS));
  }
  throw new Error(
    `Postgres did not become ready after ${READY_MAX_ATTEMPTS} attempts`,
  );
}

async function ensureDatabase(name: string): Promise<void> {
  const existing = await query(`SELECT 1 FROM pg_database WHERE datname = $1`, [
    name,
  ]);
  if (existing.rowCount) {
    console.log(`Database '${name}' already exists`);
    return;
  }
  await query(`CREATE DATABASE ${pg.escapeIdentifier(name)}`);
  console.log(`Created database '${name}'`);
}

/**
 * The database the server will connect to, read from the same resolved
 * `DATABASE_URL` the reset uses — a `.env` override of the name is created
 * too, not only the committed default. Undefined when the override names a
 * server other than the dev container's, which this script does not manage.
 */
function databaseToCreate(): string | undefined {
  loadEnvFiles();
  const { db } = readEnv();
  if (!db) return DATABASE;
  const url = new URL(db.url);
  if (!isLocalDatabase(db.url)) return undefined;
  if (url.port !== '' && url.port !== String(HOST_PORT)) return undefined;
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return name === '' ? DATABASE : name;
}

// Every `pnpm dev` boot starts from a clean, freshly seeded database: Studio
// has no real users yet, so reproducible synthetic data (src/db/seed.ts)
// beats whatever was left over from the last session. The target is the
// database the server process will connect to — the same files, in the same
// order, so a `.env` override of DATABASE_URL is reset and seeded rather
// than the default it replaced. Resetting without asking is safe only for a
// database on this machine, the guard db-reset.ts applies before a manual
// reset touches anything else; a non-local target is left alone.
async function resetAndSeed(): Promise<void> {
  loadEnvFiles();
  const { db } = readEnv();
  if (!db) throw new Error('DATABASE_URL is unset; nothing to reset.');
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
    await resetSchemaAndSeed(pool);
    console.log(`Reset and seeded ${target}`);
  } finally {
    await pool.end();
  }
}

function followLogs(): void {
  const child = spawn('docker', ['logs', '-f', containerName], {
    stdio: 'inherit',
  });

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

type Mode = 'prepare' | 'follow' | 'both';

function modeFromArgs(argv: readonly string[]): Mode {
  if (argv.includes('--prepare')) return 'prepare';
  if (argv.includes('--follow')) return 'follow';
  return 'both';
}

async function main(mode: Mode): Promise<void> {
  const alreadyRunning = containerExists() && containerIsRunning();

  // A Postgres already answering on the port without our container managing
  // it — typically the manually-run instance studio-sync's README describes.
  // Use it rather than failing the port bind.
  if (!alreadyRunning && (await postgresReachable())) {
    console.log(
      `Postgres already reachable on port ${HOST_PORT} (externally managed)`,
    );
    if (mode !== 'follow') {
      const name = databaseToCreate();
      if (name !== undefined) await ensureDatabase(name);
      await resetAndSeed();
    }
    console.log(`Postgres ready — database '${DATABASE}' on port ${HOST_PORT}`);
    if (mode === 'prepare') return;
    // Stay alive under `concurrently -k` without a container to tail: an
    // unsettled top-level await with an empty event loop makes Node exit 13.
    setInterval(() => {
      // Keep the event loop non-empty.
    }, 60_000);
    return;
  }

  if (containerExists() && !alreadyRunning) {
    removeContainer();
  }

  if (!alreadyRunning) {
    ensureVolume();
    startContainer();
  } else {
    console.log(
      `Postgres already running (${containerName}) on port ${HOST_PORT}`,
    );
  }

  console.log('Waiting for Postgres to become ready...');
  await waitForReady();
  if (mode !== 'follow') {
    const name = databaseToCreate();
    if (name !== undefined) await ensureDatabase(name);
    await resetAndSeed();
  }
  console.log(`Postgres ready — database '${DATABASE}' on port ${HOST_PORT}`);
  if (mode === 'prepare') return;
  followLogs();
}

await main(modeFromArgs(process.argv.slice(2)));
