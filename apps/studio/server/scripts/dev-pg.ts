// The port and credentials deliberately match packages/studio-sync's
// conformance-suite expectations, so one container serves the app and that
// suite.
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { createOwnerPool } from '../src/db/pool.ts';
import { checkSchema } from '../src/db/schema.ts';
import { DEV, DEV_DATABASE_URL } from '../src/env/catalogue.ts';
import { applySchema, resetSchema } from './apply.ts';
import { devSeed } from './dev-seed.ts';

const { values } = parseArgs({
  options: {
    provision: { type: 'boolean', default: false },
    follow: { type: 'boolean', default: false },
  },
});

// Provisioning and log-tailing are separable so `pnpm dev` can finish the
// first before starting the server: src/index.ts exits on a schema it catches
// mid-apply — tables present, fingerprint not yet stamped, which reads as
// stale — and resetting on every start would otherwise hit that race
// routinely. Passing neither flag keeps the provision-then-tail behaviour a
// direct run expects.
const PROVISION = values.follow ? values.provision : true;
const FOLLOW = values.provision ? values.follow : true;

// Development starts from a known state: the schema is dropped, re-applied
// and re-seeded on every run. Opt out to keep what is in the database — the
// schema is then applied only when absent, and a stale one is left alone,
// because reconciling it unasked is what could destroy work.
const KEEP_DATA = process.env.STUDIO_DEV_KEEP_DATA === '1';

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
    return await client.query(sql);
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

async function ensureDatabase(): Promise<void> {
  const existing = await query(
    `SELECT 1 FROM pg_database WHERE datname = '${DATABASE}'`,
  );
  if (existing.rowCount) {
    console.log(`Database '${DATABASE}' already exists`);
    return;
  }
  await query(`CREATE DATABASE ${DATABASE}`);
  console.log(`Created database '${DATABASE}'`);
}

async function provisionSchema(): Promise<void> {
  const db = { url: DEV_DATABASE_URL };
  const pool = createOwnerPool(db);
  try {
    if (KEEP_DATA) {
      // Absent only: a stale schema is a human decision (the boot message
      // names the remedies), and auto-reconciling it here could destroy the
      // data this mode exists to keep.
      if ((await checkSchema(pool)).kind === 'absent') {
        await applySchema(pool);
        console.log(`Applied the Studio schema to '${DATABASE}'`);
      }
      console.log('Keeping existing data (STUDIO_DEV_KEEP_DATA=1)');
      return;
    }
    await resetSchema(pool);
    console.log(`Reset the Studio schema in '${DATABASE}'`);
  } finally {
    await pool.end();
  }
  await devSeed(db);
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

// Stay alive under `concurrently -k` without a container to tail: an
// unsettled top-level await with an empty event loop makes Node exit 13.
function idle(): void {
  setInterval(() => {
    // Keep the event loop non-empty.
  }, 60_000);
}

async function main(): Promise<void> {
  const alreadyRunning = containerExists() && containerIsRunning();

  // A Postgres already answering on the port without our container managing
  // it — typically the manually-run instance studio-sync's README describes.
  // Use it rather than failing the port bind.
  if (!alreadyRunning && (await postgresReachable())) {
    console.log(
      `Postgres already reachable on port ${HOST_PORT} (externally managed)`,
    );
    if (PROVISION) {
      await ensureDatabase();
      await provisionSchema();
      console.log(
        `Postgres ready — database '${DATABASE}' on port ${HOST_PORT}`,
      );
    }
    if (FOLLOW) idle();
    return;
  }

  if (PROVISION) {
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
    await ensureDatabase();
    await provisionSchema();
    console.log(`Postgres ready — database '${DATABASE}' on port ${HOST_PORT}`);
  }

  if (!FOLLOW) return;
  // `docker logs -f` against a container that is not there exits non-zero and
  // would take the whole dev session down with it.
  if (containerIsRunning()) followLogs();
  else idle();
}

await main();
