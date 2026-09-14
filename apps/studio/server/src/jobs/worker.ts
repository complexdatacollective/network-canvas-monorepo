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
 * pg-boss's background cadences. Production leaves every one of them at its
 * default; the suites turn them down so a test does not wait out a 30-second
 * cron monitor to observe one pass.
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
  start(): Promise<void>;
  stop(): Promise<void>;
};

/**
 * pg-boss builds its own pool and its options carry no equivalent of pg's
 * `options` startup parameter, so the role is pinned through the connection
 * string, where node-postgres reads it from the query. Pinned at connect for
 * the reason src/db/pool.ts gives: a startup parameter survives RESET ROLE,
 * where a `SET ROLE` the worker issued itself would not.
 */
function connectionStringAsRole(url: string, role: string): string {
  const pinned = new URL(url);
  pinned.searchParams.set('options', `-c role=${role}`);
  return pinned.toString();
}

export function createJobWorker(deps: JobWorkerDeps): JobWorker {
  const boss = new PgBoss({
    connectionString: connectionStringAsRole(
      deps.db.url,
      TENANT_ROLES.maintenance,
    ),
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
    ...deps.intervals,
  });

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
        // pg-boss emits nothing when it was never started — it has nothing to
        // shut down — so waiting for the event would wait forever.
        if (starting === undefined) {
          await boss.stop({ graceful: false });
          return;
        }
        // `boss.stop()` already resolves after the event, but the graceful
        // wait is the contract SIGTERM depends on, so it is waited on
        // explicitly rather than inferred. Not `events.once`, which would
        // turn a transient pg-boss error during shutdown into a rejection.
        const stopped = new Promise<void>((resolve) => {
          boss.once('stopped', () => resolve());
        });
        await boss.stop({
          graceful: true,
          timeout: deps.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
        });
        await stopped;
      })();
      return stopping;
    },
  };
}
