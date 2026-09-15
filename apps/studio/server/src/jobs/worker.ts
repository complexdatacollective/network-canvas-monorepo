import type pg from 'pg';
import { PgBoss } from 'pg-boss';

import { JOB_SCHEMA } from '@codaco/studio-sync/jobs';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { StudioMailer } from '../auth/email.ts';
import type { DbEnv } from '../env.ts';
import { registerJobs } from './register.ts';

// The worker process's pg-boss: it fetches, supervises and schedules, and
// never binds a port. It owns its own pool because LISTEN/NOTIFY needs a
// session-pinned connection pg-boss manages itself — an adapter over one of
// the server's pools cannot offer that, and polling alone would put a delay on
// every sign-in email.

/** The container's stop window, less the time the pool takes to drain. */
const DEFAULT_STOP_TIMEOUT_MS = 25_000;

/**
 * pg-boss's background cadences. Production leaves them at their defaults
 * apart from the maintenance pass, which `createJobWorker` sets because a
 * queue's retention is only as short as the pass that enforces it; the suites
 * turn them all down so a test does not wait out a 30-second cron monitor to
 * observe one pass.
 */
export type JobWorkerIntervals = {
  superviseIntervalSeconds?: number;
  maintenanceIntervalSeconds?: number;
  monitorIntervalSeconds?: number;
  queueCacheIntervalSeconds?: number;
  cronMonitorIntervalSeconds?: number;
  cronWorkerIntervalSeconds?: number;
  clockMonitorIntervalSeconds?: number;
};

export type JobWorkerDeps = {
  /** How pg-boss reaches Postgres; it builds its own pool from this. */
  db: DbEnv;
  /** What the handlers run their own statements on. */
  maintenancePool: pg.Pool;
  /** Absent means no mail transport is configured; mail jobs queue up. */
  mailer?: StudioMailer;
  /** The browser-facing origin the handlers mint links against. */
  publicBaseUrl: string;
  /** The suites provision a job schema per scratch database. */
  schema?: string;
  /**
   * What the registered handlers poll at. Production leaves it at the floor
   * `registerJobs` chooses; a suite that has to prove delivery came from
   * LISTEN/NOTIFY rather than from a poll turns it up so that polling could
   * not have been what delivered the job.
   */
  workPollingIntervalSeconds?: number;
  intervals?: JobWorkerIntervals;
  stopTimeoutMs?: number;
};

export type JobWorker = {
  /** The instance, for tests that observe pg-boss rather than drive it. */
  boss: PgBoss;
  /**
   * What pg-boss was constructed with. pg-boss keeps its own copy private, so
   * this is how a suite reads back a cadence a deployment depends on — a
   * default left to pg-boss is a promise this build does not keep.
   */
  config: JobWorkerConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
};

/**
 * pg-boss hands its whole configuration to `new pg.Pool(...)`, so pg's own
 * `options` startup parameter pins the role here exactly as src/db/pool.ts
 * pins it on the server's pools — and for the same reason: a startup parameter
 * survives RESET ROLE, where a `SET ROLE` the worker issued itself would not.
 *
 * Named in a type of its own because pg-boss's typings list the pg fields it
 * expects rather than extending `pg.PoolConfig`, and `options` is not among
 * them. Rewriting the connection string instead would have to re-implement
 * what pg already does with it — a DSN carrying its own `options`, or one pg
 * accepts that `new URL` does not parse, such as a Unix socket host.
 */
type JobWorkerConfig = NonNullable<ConstructorParameters<typeof PgBoss>[0]> & {
  options?: string;
};

export function createJobWorker(deps: JobWorkerDeps): JobWorker {
  const config: JobWorkerConfig = {
    connectionString: deps.db.url,
    options: `-c role=${TENANT_ROLES.maintenance}`,
    schema: deps.schema ?? JOB_SCHEMA,
    // The schema is applied once, by apply-schema, and verified by every
    // process at boot: a worker that migrated at start could move the database
    // out from under a web process already serving requests.
    migrate: false,
    supervise: true,
    schedule: true,
    useListenNotify: true,
    // Index rebuilds, persisted warnings and queue-stats samples all write
    // tables nothing reads yet; they belong with the observability aspect of
    // #1243, which decides what a deployment is expected to store.
    reindex: false,
    persistWarnings: false,
    persistQueueStats: false,
    // Deleting a completed job happens on the maintenance pass and nowhere
    // else, so pg-boss's own default — 24 hours — is the real lifetime of
    // every queue's `deleteAfterSeconds`: a sign-in job, whose payload is the
    // magic link itself, would sit in the table for most of a day after the
    // link expired. A minute makes the queue's declared minute mean it.
    maintenanceIntervalSeconds: 60,
    ...deps.intervals,
  };
  const boss = new PgBoss(config);

  // An `error` event with no listener is an uncaught exception, which would
  // take the worker down over a transient maintenance failure that pg-boss
  // retries on its next interval.
  boss.on('error', (error) => {
    // oxlint-disable-next-line no-console -- background worker diagnostics
    console.error('Job worker error:', error);
  });

  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;

  return {
    boss,
    config,
    start: () => {
      starting ??= (async () => {
        await boss.start();
        await registerJobs(boss, deps);
      })();
      return starting;
    },
    // Memoised because pg-boss emits `stopped` once: a second call would wait
    // for an event that has already been and gone. SIGTERM and SIGINT can both
    // arrive, and a test stops a worker a failing case left running.
    stop: () => {
      stopping ??= (async () => {
        // The graceful wait is the contract SIGTERM depends on, so the event
        // is waited on explicitly rather than inferred from the call. Not
        // `events.once`, which would turn a transient pg-boss error during
        // shutdown into a rejection.
        const stopped = new Promise<void>((resolve) => {
          boss.once('stopped', () => resolve());
        });
        const halted = boss.stop({
          graceful: true,
          timeout: deps.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
        });
        // An instance that is already stopped — never started, or stopped by
        // something else — returns from `stop()` without emitting anything, so
        // the event alone would wait forever. `stop()` resolves after the
        // event when there was something to shut down, and immediately when
        // there was not; racing the two is the wait in both cases.
        await Promise.race([stopped, halted]);
        // Awaited after the race so a failed stop is reported rather than
        // dropped: SIGTERM's handler logs it.
        await halted;
      })();
      return stopping;
    },
  };
}
