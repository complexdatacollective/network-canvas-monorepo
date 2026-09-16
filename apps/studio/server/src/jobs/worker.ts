import { Context, Effect, Layer, Schema } from 'effect';
import { PgBoss } from 'pg-boss';

import { JOB_SCHEMA } from '@codaco/studio-sync/jobs';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { DbEnv } from '../env.ts';
import { Environment } from '../env.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';

// The worker process's pg-boss: it fetches, supervises and schedules, and
// never binds a port. It owns its own pool because LISTEN/NOTIFY needs a
// session-pinned connection pg-boss manages itself — an adapter over one of
// the server's pools cannot offer that, and polling alone would put a delay on
// every sign-in email.

/** The container's stop window, less the time the pool takes to drain. */
const DEFAULT_STOP_TIMEOUT_MS = 25_000;

/** Longer than the graceful stop above, so it only ever backstops it. */
const SHUTDOWN_BACKSTOP = '30 seconds';

/**
 * A queue this process cannot work: pg-boss would not start, or a registration
 * it needs was refused. Nothing the worker does works without one, so this
 * fails the layer rather than being reported and carried on from.
 */
export class QueueUnavailable extends Schema.TaggedError<QueueUnavailable>()(
  'QueueUnavailable',
  { queue: Schema.optionalKey(Schema.String), reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

/**
 * pg-boss's background cadences. Production leaves them at their defaults
 * apart from the maintenance pass, which `jobWorkerConfig` sets because a
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

export type JobWorkerOptions = {
  /** The suites provision a job schema per scratch database. */
  readonly schema?: string;
  readonly intervals?: JobWorkerIntervals;
  readonly stopTimeoutMs?: number;
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
export type JobWorkerConfig = NonNullable<
  ConstructorParameters<typeof PgBoss>[0]
> & {
  options?: string;
};

export function jobWorkerConfig(
  db: DbEnv,
  options: JobWorkerOptions = {},
): JobWorkerConfig {
  return {
    connectionString: db.url,
    options: `-c role=${TENANT_ROLES.maintenance}`,
    schema: options.schema ?? JOB_SCHEMA,
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
    ...options.intervals,
  };
}

export class JobWorker extends Context.Service<
  JobWorker,
  {
    /** The instance, for tests that observe pg-boss rather than drive it. */
    readonly boss: PgBoss;
    /**
     * What pg-boss was constructed with. pg-boss keeps its own copy private, so
     * this is how a suite reads back a cadence a deployment depends on — a
     * default left to pg-boss is a promise this build does not keep.
     */
    readonly config: JobWorkerConfig;
  }
>()('@studio/JobWorker') {
  static readonly layerPgBoss = (
    options: JobWorkerOptions = {},
  ): Layer.Layer<JobWorker, QueueUnavailable, Environment | SchemaStatus> =>
    Layer.effect(
      JobWorker,
      Effect.gen(function* () {
        const env = yield* Environment;
        const schema = yield* SchemaStatus;
        // Nothing this process does is possible against a schema that is not
        // this build's, so the queue waits for the verdict rather than
        // connecting to a database it would then have to be stopped against.
        yield* schema.current;

        const db = env.db;
        if (!db) {
          return yield* new QueueUnavailable({
            reason:
              'DATABASE_URL is required for the worker process: there are no jobs to run without a database.',
          });
        }

        const config = jobWorkerConfig(db, options);
        const boss = new PgBoss(config);

        // The program's own services, so that a line written from one of
        // pg-boss's callbacks goes through the loggers and the tracer this
        // process was built with rather than a bare runtime's defaults.
        const services = yield* Effect.context();

        // An `error` event with no listener is an uncaught exception, which
        // would take the worker down over a transient maintenance failure that
        // pg-boss retries on its next interval.
        boss.on('error', (error) => {
          Effect.runForkWith(services)(
            Effect.logError('Job worker error:', error),
          );
        });

        yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => boss.start(),
            catch: (cause) =>
              new QueueUnavailable({
                reason: cause instanceof Error ? cause.message : String(cause),
              }),
          }),
          () =>
            // One finalizer on a built layer, run once when the scope closes.
            // Today's `stop()` raced pg-boss's `stopped` event against the call
            // because a second stop — a repeated signal, or a test stopping a
            // worker a failing case left running — would have waited for an
            // event that had already been and gone; a scope runs its finalizers
            // exactly once, and only for a layer that was built, so neither the
            // never-started nor the stopped-twice case exists here.
            Effect.promise(() =>
              boss.stop({
                graceful: true,
                timeout: options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
              }),
            ).pipe(
              Effect.timeoutOrElse({
                duration: SHUTDOWN_BACKSTOP,
                orElse: () =>
                  Effect.logError(
                    `Job worker shutdown did not finish within ${SHUTDOWN_BACKSTOP}`,
                  ),
              }),
              Effect.catchCause((cause) =>
                Effect.logError('Job worker shutdown failed', cause),
              ),
            ),
        );

        return JobWorker.of({ boss, config });
      }),
    );
}
