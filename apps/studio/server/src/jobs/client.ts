import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import {
  JOB_QUEUES,
  JOB_SCHEMA,
  type JobPayload,
  type JobQueueName,
} from '@codaco/studio-sync/jobs';

import { createPool } from '../db/pool.ts';
import type { DbEnv } from '../env.ts';
import { jobDatabaseForPool } from './database.ts';
import { enqueueJob, type EnqueueOptions } from './enqueue.ts';

// The web process's pg-boss: it creates jobs and does nothing else. No
// supervision, no cron, and no migration — the schema is applied once by
// apply-schema and every process verifies it through the fingerprint, so a
// process that migrated at boot could move a database out from under another
// one that was already serving requests.

/**
 * The client's own pool. Two connections, and never the pool that serves
 * requests: pg-boss reads the queue cache on its instance connection, so a
 * cold cache would check out a second connection from the caller's pool while
 * the caller is holding one inside its transaction — which on a small pool is
 * a self-inflicted deadlock that lasts until the connection timeout. Two
 * rather than one so a cache refresh and a queue lookup never wait on each
 * other; nothing here is per-request.
 */
const CLIENT_POOL_MAX = 2;

export type JobClientOptions = {
  /** The suites provision a job schema per scratch database. */
  schema?: string;
};

export type JobClient = {
  /**
   * The instance itself, for tests that need to observe pg-boss rather than
   * enqueue through it. Creating a job is `enqueue`'s alone, which the
   * source-policy test enforces.
   */
  boss: PgBoss;
  /**
   * Connects, and refuses a database this client could not enqueue into.
   * Memoised once it succeeds; a failure is not, so the next call — including
   * the one `enqueue` makes — tries again and answers with the reason.
   */
  start(): Promise<void>;
  enqueue<Queue extends JobQueueName>(
    client: pg.PoolClient,
    queue: Queue,
    data: JobPayload<Queue>,
    options?: EnqueueOptions,
  ): Promise<string>;
  stop(): Promise<void>;
};

/**
 * pg-boss's `start()` reads the queue cache but swallows what that read
 * answers, so an instance that cannot see the queue table starts happily and
 * fails on the first enqueue instead. Asking for the declared queues by name
 * turns both halves of that — an unreadable table and a database missing a
 * queue this build declares — into a refusal the process reports itself.
 */
async function assertQueuesReachable(boss: PgBoss): Promise<void> {
  const declared = JOB_QUEUES.map(({ name }) => name);
  const found = new Set(
    (await boss.getQueues(declared)).map((queue) => queue.name),
  );
  const missing = declared.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `the job schema has no queue named ${missing.join(', ')}; apply the schema: pnpm --filter @codaco/studio-server apply-schema`,
    );
  }
}

/**
 * Built without touching the database: the schema may not be current yet, and
 * on the development lane it can become current long after this process
 * booted. The instance connects on `start()` — which the entrypoint calls once
 * the schema is verified, and which `enqueue` calls for itself, so a client
 * whose start failed or never happened still enqueues as soon as the database
 * is ready rather than needing a restart.
 */
export function createJobClient(
  db: DbEnv,
  options: JobClientOptions = {},
): JobClient {
  // Its own pool, pinned to the application role the way every other pool of
  // this process is: a job is created by the role that may create one and can
  // do nothing else with it.
  const pool = createPool(db, { max: CLIENT_POOL_MAX });

  const boss = new PgBoss({
    db: jobDatabaseForPool(pool),
    schema: options.schema ?? JOB_SCHEMA,
    migrate: false,
    supervise: false,
    schedule: false,
  });

  // PgBoss is an EventEmitter, and an `error` with no listener is an uncaught
  // exception that would take the web process down. Nothing here is fatal:
  // the queue cache refresh is the only background work this instance does.
  boss.on('error', (error) => {
    // oxlint-disable-next-line no-console -- server-side failure diagnostics
    console.error('Job client error:', error);
  });

  let started: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;

  const start = (): Promise<void> => {
    started ??= (async () => {
      await boss.start();
      await assertQueuesReachable(boss);
    })().catch((error: unknown) => {
      // Cleared so the next caller retries. A revoked grant, a schema applied
      // a moment later, a database that was still coming up: every reason a
      // start fails here is one that the next request may find fixed, and a
      // memoised rejection would make the process useless until it restarted.
      started = undefined;
      throw error;
    });
    return started;
  };

  return {
    boss,
    start,
    enqueue: async (client, queue, data, enqueueOptions) => {
      // Waited for inside the caller's transaction, which for an invitation
      // means while the team's audit lock is held (src/team/commands.ts): a
      // database that is up but slow to connect holds that lock for as long
      // as this takes, and a start that failed is retried by the next call
      // rather than memoised — so a command arriving while the database is
      // down runs a fresh connection attempt of its own. Both are bounded by
      // the pool's `connectionTimeoutMillis` (src/db/pool.ts), which is what
      // keeps a team's commands from queueing behind an unreachable database
      // indefinitely.
      await start();
      return enqueueJob(boss, client, queue, data, enqueueOptions);
    },
    // Nothing of ours is ever in flight on this instance, so there is nothing
    // for a graceful stop to wait out. Memoised, and safe before a start (the
    // instance is stopped until one happens), during one (pg-boss's own stop
    // waits the start out) and after another stop.
    stop: () => {
      stopping ??= (async () => {
        await boss.stop({ graceful: false });
        // pg-boss closes only a pool it opened itself, and this one is ours.
        await pool.end();
      })();
      return stopping;
    },
  };
}
