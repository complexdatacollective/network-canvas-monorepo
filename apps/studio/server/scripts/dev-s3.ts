/* oxlint-disable no-console -- dev tooling log output */
// Branch-scoped MinIO for local development, mirroring Fresco's dev-s3
// script (apps/fresco/scripts/dev-s3.ts): development never touches
// third-party services (#1246, 2026-08-11). Runs under `concurrently` from
// the package's dev script.
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { DEV } from '../src/env/catalogue.ts';

const { values } = parseArgs({
  options: {
    provision: { type: 'boolean', default: false },
    follow: { type: 'boolean', default: false },
  },
});

// The same split dev-pg.ts makes, and for the same reason: `pnpm dev` runs
// provisioning to completion before the server starts. Passing neither flag
// keeps the provision-then-tail behaviour a direct run expects.
const PROVISION = values.follow ? values.provision : true;
const FOLLOW = values.provision ? values.follow : true;

// Uploaded assets are emptied alongside the database reset, so bytes never
// outlive the rows that referenced them. Opt out with the same variable
// dev-pg.ts reads, so one setting covers the whole dev environment.
const KEEP_DATA = process.env.STUDIO_DEV_KEEP_DATA === '1';

const IMAGE = 'minio/minio:latest';
const HOST_PORT = DEV.s3Port;
const CONTAINER_PORT = 9000;
const BUCKET = DEV.s3Bucket;
const REGION = DEV.s3Region;
const ACCESS_KEY_ID = DEV.s3AccessKeyId;
const SECRET_ACCESS_KEY = DEV.s3SecretAccessKey;
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

const containerName = `studio-dev-minio-${safeBranch}`;
const volumeName = `studio-dev-minio-${safeBranch}`;

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
  console.log(`Starting MinIO on port ${HOST_PORT} [branch: ${branch}]...`);
  const result = docker([
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-p',
    `${HOST_PORT}:${CONTAINER_PORT}`,
    '-v',
    `${volumeName}:/data`,
    '-e',
    `MINIO_ROOT_USER=${ACCESS_KEY_ID}`,
    '-e',
    `MINIO_ROOT_PASSWORD=${SECRET_ACCESS_KEY}`,
    '-e',
    'MINIO_API_CORS_ALLOW_ORIGIN=*',
    IMAGE,
    'server',
    '/data',
  ]);
  if (result.status !== 0) {
    throw new Error(`docker run failed: ${result.stderr}`);
  }
}

function createS3Client(): S3Client {
  return new S3Client({
    endpoint: `http://localhost:${HOST_PORT}`,
    region: REGION,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

async function minioReachable(client: S3Client): Promise<boolean> {
  try {
    await Promise.race([
      client.send(new ListBucketsCommand({})),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), 1500),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function waitForReady(client: S3Client): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= READY_MAX_ATTEMPTS; attempt++) {
    try {
      await client.send(new ListBucketsCommand({}));
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, READY_INTERVAL_MS));
    }
  }
  throw new Error(
    `MinIO did not become ready after ${READY_MAX_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}

async function ensureBucket(client: S3Client): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Created bucket '${BUCKET}'`);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'BucketAlreadyOwnedByYou' ||
        error.name === 'BucketAlreadyExists')
    ) {
      console.log(`Bucket '${BUCKET}' already exists`);
      return;
    }
    throw error;
  }
}

// One page of keys per round trip; both the listing and the delete cap at a
// thousand, so the two stay in step.
async function emptyBucket(client: S3Client): Promise<void> {
  let removed = 0;
  let token: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }),
    );
    const objects = (listed.Contents ?? []).flatMap((object) =>
      object.Key === undefined ? [] : [{ Key: object.Key }],
    );
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: objects, Quiet: true },
        }),
      );
      removed += objects.length;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token !== undefined);
  console.log(
    removed === 0
      ? `Bucket '${BUCKET}' is already empty`
      : `Emptied bucket '${BUCKET}' (${removed} object(s))`,
  );
}

// The bucket is shared across branches by design (fixed port, fixed name), so
// this empties another branch's assets too. That is the cost of one dev
// object store; STUDIO_DEV_KEEP_DATA=1 opts out.
async function provisionBucket(client: S3Client): Promise<void> {
  await ensureBucket(client);
  if (KEEP_DATA) {
    console.log('Keeping existing objects (STUDIO_DEV_KEEP_DATA=1)');
    return;
  }
  await emptyBucket(client);
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
// unsettled top-level await with an empty event loop makes Node exit.
function idle(): void {
  setInterval(() => {
    // Keep the event loop non-empty.
  }, 60_000);
}

async function main(): Promise<void> {
  const alreadyRunning = containerExists() && containerIsRunning();

  // A MinIO already answering on the port without our container managing it —
  // typically another branch's still-running dev container (branch-scoped
  // names, fixed port). Use it rather than failing the port bind; the
  // credentials and bucket are the same across branches.
  if (!alreadyRunning) {
    const probe = createS3Client();
    if (await minioReachable(probe)) {
      console.log(
        `MinIO already reachable on port ${HOST_PORT} (externally managed)`,
      );
      if (PROVISION) {
        await provisionBucket(probe);
        console.log(
          `MinIO ready — bucket '${BUCKET}' at http://localhost:${HOST_PORT}`,
        );
      }
      if (FOLLOW) idle();
      return;
    }
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
        `MinIO already running (${containerName}) on port ${HOST_PORT}`,
      );
    }

    const s3 = createS3Client();
    console.log('Waiting for MinIO to become ready...');
    await waitForReady(s3);
    await provisionBucket(s3);
    console.log(
      `MinIO ready — bucket '${BUCKET}' at http://localhost:${HOST_PORT}`,
    );
  }

  if (!FOLLOW) return;
  // `docker logs -f` against a container that is not there exits non-zero and
  // would take the whole dev session down with it.
  if (containerIsRunning()) followLogs();
  else idle();
}

await main();
