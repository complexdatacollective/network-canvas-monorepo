import { Effect, Layer, Option, Ref, Schema } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { DatabasePool } from '../db/database-pool.ts';
import { type DbEnv, Environment, type StudioEnv } from '../env.ts';
import {
  databaseCheck,
  type HealthCheck,
  type HealthChecks,
  HealthRoutes,
  schemaCheckOnPool,
} from '../http/health.ts';
import { JobClock } from '../jobs/effect/clock.ts';
import { Database } from '../jobs/effect/database.ts';
import { DeniedAuditSummaryWriter } from '../jobs/effect/handlers/denied-attempts/audit-writer.ts';
import { DeniedAttemptsStore } from '../jobs/effect/handlers/denied-attempts/store.ts';
import { Jobs } from '../jobs/effect/jobs.ts';
import {
  JobMaintenanceGate,
  MaintenanceState,
} from '../jobs/effect/maintenance.ts';
import { JobQueueMetrics } from '../jobs/effect/metrics.ts';
import { jobsCheck } from '../jobs/effect/readiness.ts';
import { JobHandlersLive } from '../jobs/effect/registrations.ts';
import { JobWorker } from '../jobs/effect/worker.ts';
import { NATIVE_JOB_SCHEMA } from '../jobs/queues.ts';
import { MailerLive } from '../mail/live.ts';
import { WorkerHealthServerLive } from '../platform/http-server.ts';
import { LoggerLive } from '../platform/logger.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';
import { TracingLive } from '../platform/tracing.ts';
import { createRateLimiter } from '../rate-limit.ts';
import { getRateLimitStore, RateLimitStoresLive } from '../rate-limit/store.ts';
import { verifySecretKeysOrExit } from '../secrets/boot.ts';
import { STUDIO_VERSION } from '../version.ts';

// The worker program: the same image as src/programs/serve.ts, started with a
// different command (#1895). It executes the jobs the web process creates and
// runs the cron schedules. It serves no surface — it imports neither the HTTP
// router nor the RPC router, which a source-policy test pins
// (src/__tests__/process-separation.test.ts) — and the one port it binds is
// the loopback health listener, which exists because a container healthcheck
// is otherwise the one thing that cannot ask a process which answers nothing
// whether it is working (#1897, #1909).
//
// It is also the only process that holds a mail transport, which is why it is
// the only one that reads SMTP_URL and EMAIL_FROM (`Environment.layerWithMail`)
// and the only one that imports src/mail/live.ts.
//
// Acquisition order is the boot order and finalizers run in reverse. The
// health listener binds before the schema gate, so a `docker compose up` can
// read an honest `failing` — naming the schema — rather than a refused
// connection; and because it is acquired before the queue it closes after the
// job drain, so `/readyz` stays answerable while jobs finish. The drain itself
// is `JobWorker.layer`'s own scope finalizer: it stops claiming, waits 25
// seconds for in-flight handlers, then lets the scope interrupt whatever is
// left — inside the compose file's 40-second `stop_grace_period`. Exit codes
// come from `NodeRuntime.runMain`: 0 after a clean stop, 130 on a signal, 1 for
// a layer that would not build.

/** A refusal that stands in for the process: a message for the operator, exit code 1. */
class WorkerRefused extends Schema.TaggedError<WorkerRefused>()(
  'WorkerRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

/**
 * The `jobs` readiness check before the queue's own layers are built. They are
 * built after the schema gate and the secrets check, on purpose — nothing may
 * claim a job against a schema this build did not make, or with a keyring that
 * cannot produce the key ids already in the database — while the listener binds
 * before both, so it can say which of the two it is still waiting on.
 */
class JobsNotStarted extends Schema.TaggedError<JobsNotStarted>()(
  'JobsNotStarted',
  {},
) {
  override get message(): string {
    return 'not started';
  }
}

/** What the `jobs` check reads once the queue's layers have been built. */
type StartedQueue = {
  readonly worker: JobWorker['Service'];
  readonly database: Database['Service'];
};

/**
 * Readiness (#1897). `jobs` is `jobsCheck` — the worker's own `ready` flag,
 * which its first answered claim sets, plus a read issued now — reached through
 * a handle the graph fills in, because the listener binds first. Until then the
 * answer is `failed: not started`: an instance that does not exist answers
 * nothing, and the maintenance pool would still reach Postgres.
 */
function workerChecks(
  env: StudioEnv,
  pool: DatabasePool['Service']['pool'],
  started: Ref.Ref<Option.Option<StartedQueue>>,
): HealthChecks {
  const limiter = createRateLimiter(env);
  const jobs: HealthCheck = Effect.gen(function* () {
    const queue = yield* Ref.get(started);
    if (Option.isNone(queue)) return yield* new JobsNotStarted();
    return yield* jobsCheck(queue.value.worker, queue.value.database);
  });
  return {
    db: databaseCheck(pool),
    // Checked live on the pool rather than through `SchemaStatus`, because the
    // listener is acquired before the gate on purpose (above).
    schema: schemaCheckOnPool(pool),
    // `degraded`, never `failed`: the limiter fails open, so a worker that
    // cannot reach it still runs every job it has — only the summary job has
    // nothing to drain. Omitted where no store is configured, like every other
    // unconfigured surface.
    ...(limiter.configured
      ? { limiter: Effect.promise(() => limiter.readiness()) }
      : {}),
    jobs,
  };
}

function workerWith(env: StudioEnv, db: DbEnv) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const { pool } = yield* DatabasePool;
      const started = yield* Ref.make(Option.none<StartedQueue>());

      // 127.0.0.1 by construction, not by configuration
      // (`WorkerHealthServerLive`): this listener answers the container runtime
      // and nothing else, and a worker is not a service anything routes to.
      const Health = HttpRouter.serve(
        HealthRoutes(workerChecks(env, pool, started)),
        {
          disableLogger: true,
          disableListenLog: true,
        },
      ).pipe(Layer.provideMerge(WorkerHealthServerLive));

      // Beside the fingerprint check and for the same reason (#1900): the
      // worker is what signs webhook deliveries, so a keyring that cannot
      // produce a stored key id would turn every delivery for that team into a
      // failed job. Waits for the gate, so the development lane's wait is one
      // wait.
      const SecretsVerified = Layer.effectDiscard(
        Effect.gen(function* () {
          const status = yield* SchemaStatus;
          yield* status.current;
          yield* Effect.promise(() => verifySecretKeysOrExit(env, pool));
        }),
      );

      // The maintenance client the queue runs on. Same database, same role and
      // the same (absent) search path as the `DatabasePool` the summary
      // writer's own pool is built from, which those two have to agree on: the
      // handler's idempotency read goes through this client while the audit
      // row is written through that pool, and two schemas apart the read would
      // report every written summary as missing.
      const QueueDatabase = Database.layer('maintenance', {
        url: db.url,
        applicationName: 'studio-worker',
      });

      // Started means every handler registered and the first job claimable,
      // which is what readiness reports from here on.
      const Started = Layer.effectDiscard(
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          const database = yield* Database;
          yield* Ref.set(started, Option.some({ worker, database }));
          yield* Effect.log(
            `Network Canvas Studio worker ${STUDIO_VERSION} started`,
          );
        }),
      );

      return Started.pipe(
        // One flag over the whole worker (#1927 §20 Q9). Studio has no
        // maintenance mode yet, so the state is constantly off; the gate is
        // wired now so the stage that adds one only replaces the state.
        Layer.provide(JobMaintenanceGate.layer()),
        Layer.provide(MaintenanceState.layerOff),
        // For `studio_jobs_queue_depth` and the backlog warning. Readiness does
        // not depend on it: the worker's own poll fibers set `ready` from their
        // first answered claim.
        Layer.provide(JobQueueMetrics.layer()),
        Layer.provide(JobHandlersLive),
        Layer.provide(
          env.redis
            ? DeniedAttemptsStore.layer(getRateLimitStore(env.redis))
            : DeniedAttemptsStore.layerAbsent,
        ),
        Layer.provide(DeniedAuditSummaryWriter.layer(pool)),
        Layer.provideMerge(JobWorker.layer({ schema: NATIVE_JOB_SCHEMA })),
        Layer.provide(Jobs.layer({ schema: NATIVE_JOB_SCHEMA })),
        // The production skew correction, measured against this client's own
        // `now()`; the uncorrected clock is the suites'.
        Layer.provide(JobClock.layer()),
        Layer.provideMerge(QueueDatabase),
        Layer.provide(MailerLive),
        Layer.provide(SecretsVerified),
        Layer.provideMerge(SchemaStatus.layer),
        Layer.provide(Health),
      );
    }),
  ).pipe(
    Layer.provide(RateLimitStoresLive),
    Layer.provide(DatabasePool.layerMaintenance(db)),
  );
}

/**
 * Everything the worker process is. A worker without a database has no work
 * at all — the web process serves a useful surface without one, but a
 * container that stayed up pretending otherwise would look healthy — so the
 * absence is a refusal rather than a degraded mode. `auth` follows the
 * database down and cannot be undefined beside one: `resolve` refuses a
 * database without a signing secret or a public URL.
 */
export const WorkerProgram = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Environment;
    const { db, auth } = env;
    if (!db || !auth) {
      return yield* new WorkerRefused({
        reason:
          'DATABASE_URL is required for the worker process: there are no jobs to run without a database.',
      });
    }
    return workerWith(env, db);
  }),
).pipe(
  Layer.provide(Layer.mergeAll(LoggerLive, TracingLive('worker'))),
  Layer.provide(Environment.layerWithMail),
);
