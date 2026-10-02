import { Effect, Layer, Option, Ref, Schema } from 'effect';
import { HttpRouter } from 'effect/http';

import { MaintenanceDatabase, ReadinessDatabase } from '../db/client.ts';
import { type DbEnv, Environment } from '../env.ts';
import {
  databaseCheck,
  type HealthCheck,
  type HealthChecks,
  HealthRoutes,
  schemaCheckOn,
} from '../http/health.ts';
import { JobClock } from '../jobs/clock.ts';
import { DeniedAttemptsStore } from '../jobs/handlers/denied-attempts/store.ts';
import { Jobs } from '../jobs/jobs.ts';
import { JobMaintenanceGate } from '../jobs/maintenance.ts';
import { JobQueueMetrics } from '../jobs/metrics.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import { jobsCheck } from '../jobs/readiness.ts';
import { JobHandlersLive } from '../jobs/registrations.ts';
import { JobWorker } from '../jobs/worker.ts';
import { MailerLive } from '../mail/live.ts';
import { WorkerHealthServerLive } from '../platform/http-server.ts';
import { LoggerLive } from '../platform/logger.ts';
import { MaintenanceState } from '../platform/maintenance-state.ts';
import { SchemaStatus } from '../platform/schema-gate.ts';
import { TracingLive } from '../platform/tracing.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { RateLimitStore } from '../rate-limit/store.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { KeyringVerified } from '../secrets/verify.ts';
import { STUDIO_VERSION } from '../version.ts';
import { reportingRefusals } from './command.ts';

// The health listener binds before the schema gate, and because it is acquired
// before the queue it closes after the job drain, so `/readyz` stays answerable
// while jobs finish.

class WorkerRefused extends Schema.TaggedError<WorkerRefused>()(
  'WorkerRefused',
  { reason: Schema.String },
) {
  override get message(): string {
    return this.reason;
  }
}

class JobsNotStarted extends Schema.TaggedError<JobsNotStarted>()(
  'JobsNotStarted',
  {},
) {
  override get message(): string {
    return 'not started';
  }
}

type StartedQueue = {
  readonly worker: JobWorker['Service'];
  readonly database: MaintenanceDatabase['Service'];
};

function workerChecks(
  readiness: ReadinessDatabase['Service'],
  limiter: RateLimiter['Service'],
  started: Ref.Ref<Option.Option<StartedQueue>>,
): HealthChecks {
  const jobs: HealthCheck = Effect.gen(function* () {
    const queue = yield* Ref.get(started);
    if (Option.isNone(queue)) return yield* new JobsNotStarted();
    return yield* jobsCheck(queue.value.worker, queue.value.database);
  });
  return {
    db: databaseCheck(readiness.sql),
    // Checked live rather than through `SchemaStatus`, because the listener is
    // acquired before the gate on purpose (above).
    schema: schemaCheckOn(readiness.sql),
    // `degraded`, never `failed`: the limiter fails open.
    ...(limiter.configured ? { limiter: limiter.readiness } : {}),
    jobs,
  };
}

function workerWith(db: DbEnv) {
  return Layer.unwrap(
    Effect.gen(function* () {
      const readiness = yield* ReadinessDatabase;
      const limiter = yield* RateLimiter;
      const started = yield* Ref.make(Option.none<StartedQueue>());

      const Health = HttpRouter.serve(
        HealthRoutes(workerChecks(readiness, limiter, started)),
        {
          disableLogger: true,
          disableListenLog: true,
        },
      ).pipe(Layer.provideMerge(WorkerHealthServerLive));

      // `Layer.provide` builds what it is given first, so the schema is
      // current before the keyring is read.
      const SchemaCurrent = Layer.effectDiscard(
        Effect.flatMap(SchemaStatus, (status) => status.current),
      );
      const SecretsVerified = KeyringVerified.pipe(
        Layer.provide(SchemaCurrent),
        Layer.provide(SecretsCipher.layerFromEnvironment),
      );

      const QueueDatabase = MaintenanceDatabase.layer({
        ...db,
        applicationName: 'studio-worker',
      });

      const Started = Layer.effectDiscard(
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          const database = yield* MaintenanceDatabase;
          yield* Ref.set(started, Option.some({ worker, database }));
          yield* Effect.log(
            `Network Canvas Studio worker ${STUDIO_VERSION} started`,
          );
        }),
      );

      return Started.pipe(
        Layer.provide(JobMaintenanceGate.layer()),
        Layer.provide(MaintenanceState.layerMaintenance),
        Layer.provide(JobQueueMetrics.layer()),
        Layer.provide(JobHandlersLive),
        Layer.provide(DeniedAttemptsStore.layer),
        // Paused until the gate's first reading: a worker that booted
        // fetching could claim before that reading said "maintenance".
        Layer.provideMerge(
          JobWorker.layer({ schema: JOB_SCHEMA, startPaused: true }),
        ),
        Layer.provide(Jobs.layer({ schema: JOB_SCHEMA })),
        Layer.provide(JobClock.layer()),
        Layer.provideMerge(QueueDatabase),
        Layer.provide(MailerLive),
        Layer.provide(SecretsVerified),
        Layer.provideMerge(SchemaStatus.layer),
        Layer.provide(Health),
      );
    }),
  ).pipe(
    // Acquired before everything that reads through it, so it closes after
    // the job drain.
    Layer.provide(RateLimiter.layer),
    Layer.provide(RateLimitStore.layer),
    Layer.provide(Layer.orDie(ReadinessDatabase.layer('maintenance', db))),
  );
}

const WorkerProgramLayer = Layer.unwrap(
  Effect.gen(function* () {
    const env = yield* Environment;
    const { db, auth } = env;
    if (!db || !auth) {
      return yield* new WorkerRefused({
        reason:
          'DATABASE_URL is required for the worker process: there are no jobs to run without a database.',
      });
    }
    return workerWith(db);
  }),
).pipe(
  Layer.provide(Layer.mergeAll(LoggerLive, TracingLive('worker'))),
  Layer.provide(Environment.layerWithMail),
);

export const WorkerProgram =
  Layer.launch(WorkerProgramLayer).pipe(reportingRefusals);
