import { Effect, Layer, Option, Ref, Schema } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

import { DatabasePool } from '../db/database-pool.ts';
import { type DbEnv, Environment, type StudioEnv } from '../env.ts';
import {
  type CheckVerdict,
  databaseCheck,
  type HealthChecks,
  HealthRoutes,
  schemaCheckOnPool,
} from '../http/health.ts';
import { JobHandlersLive } from '../jobs/registrations.ts';
import { JobWorker } from '../jobs/worker.ts';
import { MailerLive } from '../mail/live.ts';
import { WorkerHealthServerLive } from '../platform/http-server.ts';
import { LoggerLive } from '../platform/logger.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';
import { TracingLive } from '../platform/tracing.ts';
import { createRateLimiter } from '../rate-limit.ts';
import { RateLimitStoresLive } from '../rate-limit/store.ts';
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
// connection; and because it is acquired before the job worker it closes
// after the job drain, so `/readyz` stays answerable while jobs finish. The
// drain itself is the job worker's finalizer: 25 seconds of grace under a
// 30-second bound, inside the compose file's 40-second `stop_grace_period`.
// Exit codes come from `NodeRuntime.runMain`: 0 after a clean stop, 130 on a
// signal, 1 for a layer that would not build.

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
 * The `jobs` readiness check before pg-boss is connected. Stage 5 moves this
 * onto `JobWorker.ready`; until then the check reads the handle below.
 */
class JobsNotStarted extends Schema.TaggedError<JobsNotStarted>()(
  'JobsNotStarted',
  {},
) {
  override get message(): string {
    return 'not started';
  }
}

/**
 * Readiness (#1897) for a process whose pg-boss connects after the listener
 * binds: the `jobs` check reads a handle the graph fills in once the worker
 * is started, so the listener can answer `failed: not started` in the meantime
 * — an instance that exists but has not started answers nothing, and the
 * maintenance pool would still reach Postgres.
 */
function workerChecks(
  env: StudioEnv,
  pool: DatabasePool['Service']['pool'],
  started: Ref.Ref<Option.Option<JobWorker['Service']>>,
): HealthChecks {
  const limiter = createRateLimiter(env);
  const jobs = Effect.gen(function* () {
    const worker = yield* Ref.get(started);
    if (Option.isNone(worker)) return yield* new JobsNotStarted();
    // pg-boss's own connection rather than the maintenance pool: the point of
    // this check is that the queue is reachable, and the two use different
    // pools.
    yield* Effect.promise(() =>
      worker.value.boss.getDb().executeSql('select 1'),
    );
    return 'ok' as const satisfies CheckVerdict;
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
      const started = yield* Ref.make(Option.none<JobWorker['Service']>());

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

      // Started means connected with every handler registered, which is what
      // readiness reports from here on.
      const Started = Layer.effectDiscard(
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* Ref.set(started, Option.some(worker));
          yield* Effect.log(
            `Network Canvas Studio worker ${STUDIO_VERSION} started`,
          );
        }),
      );

      return Started.pipe(
        Layer.provide(JobHandlersLive()),
        Layer.provideMerge(JobWorker.layerPgBoss()),
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
