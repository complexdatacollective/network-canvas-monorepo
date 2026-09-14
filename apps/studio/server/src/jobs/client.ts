import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import {
  JOB_SCHEMA,
  type JobPayload,
  type JobQueueName,
} from '@codaco/studio-sync/jobs';

import { jobDatabaseForPool } from './database.ts';
import { enqueueJob, type EnqueueOptions } from './enqueue.ts';

// The web process's pg-boss: it creates jobs and does nothing else. No
// supervision, no cron, and no migration — the schema is applied once by
// apply-schema and every process verifies it through the fingerprint, so a
// process that migrated at boot could move a database out from under another
// one that was already serving requests.

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
  enqueue<Queue extends JobQueueName>(
    client: pg.PoolClient,
    queue: Queue,
    data: JobPayload<Queue>,
    options?: EnqueueOptions,
  ): Promise<string>;
  stop(): Promise<void>;
};

export async function createJobClient(
  pool: pg.Pool,
  options: JobClientOptions = {},
): Promise<JobClient> {
  const boss = new PgBoss({
    // The application pool, so every statement runs as the application role —
    // which may create a job and cannot read, retry or delete one.
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

  await boss.start();

  return {
    boss,
    enqueue: (client, queue, data, enqueueOptions) =>
      enqueueJob(boss, client, queue, data, enqueueOptions),
    // Nothing of ours is ever in flight on this instance, so there is nothing
    // for a graceful stop to wait out. The pool belongs to the caller and
    // pg-boss never closes one it did not open.
    stop: () => boss.stop({ graceful: false }),
  };
}
