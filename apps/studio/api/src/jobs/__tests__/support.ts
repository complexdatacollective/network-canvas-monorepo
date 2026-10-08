import { randomUUID } from 'node:crypto';

import {
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  Scope,
} from 'effect';

import type { JobPayload, JobQueueName } from '@codaco/studio-sync/jobs';

import {
  TestDatabase,
  TestDatabaseLive,
} from '../../__tests__/support/database.ts';
import {
  Database,
  type DatabaseService,
  MaintenanceDatabase,
  OwnerDatabase,
} from '../../db/client.ts';
import { splitStatements } from '../../db/statements.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import type { DbEnv } from '../../env.ts';
import { JobClock } from '../clock.ts';
import { type EnqueueOptions, Jobs } from '../jobs.ts';
import { resolvedQueue } from '../queues.ts';
import {
  dropJobSchemaSql,
  jobSchemaGrantsSql,
  jobSchemaSql,
} from '../schema.ts';
import {
  type JobHandler,
  type JobOutcome,
  JobWorker,
  type JobWorkerConfig,
} from '../worker.ts';

export type QueueHarnessShape = {
  readonly schema: string;
  readonly app: DatabaseService;
  readonly maintenance: DatabaseService;
  readonly owner: DatabaseService;
};

export class QueueHarness extends Context.Service<
  QueueHarness,
  QueueHarnessShape
>()('@studio/jobs/test/QueueHarness') {}

const installSchema = Effect.fnUntraced(function* (schema: string) {
  const { sql } = yield* MaintenanceDatabase;
  for (const statement of [
    ...splitStatements(jobSchemaSql(schema)),
    ...splitStatements(jobSchemaGrantsSql(schema)),
  ]) {
    yield* sql.unsafe(statement);
  }
});

const clientConfig = (
  identity: 'app' | 'maintenance' | 'owner',
  db: DbEnv,
) => ({
  url: db.url,
  maxConnections: 4,
  applicationName: `studio-test-${identity}`,
});

export const layerQueueHarness = (db: DbEnv): Layer.Layer<QueueHarness> =>
  Layer.effect(
    QueueHarness,
    Effect.gen(function* () {
      const schema = `studio_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      const owner = Context.get(
        yield* Effect.orDie(
          Layer.build(OwnerDatabase.layer(clientConfig('owner', db))),
        ),
        OwnerDatabase,
      );
      const app = Context.get(
        yield* Effect.orDie(
          Layer.build(Database.layer(clientConfig('app', db))),
        ),
        Database,
      );
      const maintenance = Context.get(
        yield* Effect.orDie(
          Layer.build(
            MaintenanceDatabase.layer(clientConfig('maintenance', db)),
          ),
        ),
        MaintenanceDatabase,
      );

      const asOwner = <A, E>(
        effect: Effect.Effect<A, E, MaintenanceDatabase>,
      ) => Effect.provideService(effect, MaintenanceDatabase, owner);

      yield* Effect.orDie(
        asOwner(MaintenanceScope.open(installSchema(schema))),
      );

      yield* Effect.addFinalizer(() =>
        Effect.orDie(
          asOwner(
            Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
              sql.unsafe(dropJobSchemaSql(schema)),
            ),
          ),
        ),
      );

      return QueueHarness.of({ schema, app, maintenance, owner });
    }),
  );

export const asApp = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaintenanceDatabase> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, MaintenanceDatabase, harness.app),
  );

export const asMaintenance = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaintenanceDatabase> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, MaintenanceDatabase, harness.maintenance),
  );

export const asOwner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaintenanceDatabase> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, MaintenanceDatabase, harness.owner),
  );

const layerMaintenanceDatabase: Layer.Layer<
  MaintenanceDatabase,
  never,
  QueueHarness
> = Layer.effect(
  MaintenanceDatabase,
  Effect.map(QueueHarness, (harness) => harness.maintenance),
);

export const layerWorker = (
  config: Omit<JobWorkerConfig, 'schema'> = {},
  clock: Layer.Layer<never> = JobClock.layerTest,
): Layer.Layer<JobWorker | Jobs | MaintenanceDatabase, never, QueueHarness> =>
  Layer.unwrap(
    Effect.map(QueueHarness, (harness) =>
      JobWorker.layer({
        schema: harness.schema,
        background: false,
        ...config,
      }).pipe(
        Layer.provideMerge(Jobs.layer({ schema: harness.schema })),
        Layer.provideMerge(layerMaintenanceDatabase),
        Layer.provide(clock),
      ),
    ),
  );

export type JobRow = {
  readonly id: string;
  readonly queue: string;
  readonly state: string;
  readonly policy: string;
  readonly attempts: number;
  readonly payload: unknown;
  readonly singleton_key: string | null;
  readonly retry_limit: number;
  readonly retry_delay: number;
  readonly retry_backoff: boolean;
  readonly retry_delay_max: number | null;
  readonly expire_in_seconds: number;
  readonly last_error: string | null;
  readonly outcome: string | null;
  readonly dead_letter_of: string | null;
  readonly run_at: Date;
  readonly keep_until: Date;
  readonly locked_until: Date | null;
  readonly completed_at: Date | null;
};

export const readJobs = Effect.fnUntraced(function* (queue?: string) {
  const { schema } = yield* QueueHarness;
  return yield* asOwner(
    Effect.flatMap(
      MaintenanceDatabase,
      ({ sql }) =>
        sql<JobRow>`
          SELECT id, queue, state, policy, attempts, payload, singleton_key,
                 retry_limit, retry_delay, retry_backoff, retry_delay_max,
                 expire_in_seconds, last_error,
                 outcome, dead_letter_of, run_at, keep_until, locked_until,
                 completed_at
            FROM ${sql(schema)}.jobs
           WHERE ${queue === undefined ? sql.literal('true') : sql`queue = ${queue}`}
           ORDER BY created_at, queue`,
    ),
  );
});

export const DELIVERY = resolvedQueue('invitation-delivery');

export const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

export const SEED = 'studio-jobs';

export const LEASE_EXPIRED =
  'the attempt did not finish before its lease expired';

export const layerJobs: Layer.Layer<Jobs, never, QueueHarness> = Layer.unwrap(
  Effect.map(QueueHarness, (harness) => Jobs.layer({ schema: harness.schema })),
);

export const clearQueue = Effect.gen(function* () {
  const { schema } = yield* QueueHarness;
  yield* asOwner(
    Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
      sql.unsafe(`DELETE FROM ${schema}.jobs`),
    ),
  );
  yield* asOwner(
    Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
      sql.unsafe(`DELETE FROM ${schema}.job_schedules`),
    ),
  );
});

export const enqueue = <Queue extends JobQueueName>(
  queue: Queue,
  payload: JobPayload<Queue>,
  options?: EnqueueOptions,
) =>
  Effect.flatMap(Jobs, (jobs) =>
    asApp(MaintenanceScope.open(jobs.enqueue(queue, payload, options))),
  );

export const enqueueDelivery = (
  deliveryId: string = DELIVERY_ID,
  options?: EnqueueOptions,
) => enqueue('invitation-delivery', { deliveryId }, options);

export const enqueueSweep = enqueue('denied-attempts-summary', {});

export const updateJob = Effect.fnUntraced(function* (
  jobId: string,
  assignment: string,
) {
  const { schema } = yield* QueueHarness;
  yield* asOwner(
    Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
      sql.unsafe(
        `UPDATE ${schema}.jobs SET ${assignment} WHERE id = '${jobId}'`,
      ),
    ),
  );
});

export type ScheduleRow = {
  readonly name: string;
  readonly cron: string;
  readonly queue: string;
  readonly next_run_at: Date;
};

export const readSchedules = Effect.fnUntraced(function* () {
  const { schema } = yield* QueueHarness;
  return yield* asOwner(
    Effect.flatMap(
      MaintenanceDatabase,
      ({ sql }) => sql<ScheduleRow>`
        SELECT name, cron, queue, next_run_at
          FROM ${sql(schema)}.job_schedules
         ORDER BY name`,
    ),
  );
});

export const onWorker = <A, E, R>(
  body: (worker: JobWorker['Service']) => Effect.Effect<A, E, R>,
  config?: Omit<JobWorkerConfig, 'schema'>,
) => Effect.flatMap(JobWorker, body).pipe(Effect.provide(layerWorker(config)));

export const drainWith = <Queue extends JobQueueName, E, R>(
  queue: Queue,
  handler: JobHandler<Queue, E, R>,
  config?: Omit<JobWorkerConfig, 'schema'>,
) =>
  onWorker(
    (worker) =>
      Effect.flatMap(worker.work(queue, handler), () =>
        worker.drainOnce(queue),
      ),
    config,
  );

export const claimAndHold = (
  worker: JobWorker['Service'],
  queue: JobQueueName,
  gates: {
    readonly started: Deferred.Deferred<void>;
    readonly held: Deferred.Deferred<void>;
  },
  outcome: Effect.Effect<JobOutcome, unknown> = Effect.succeed<JobOutcome>(
    'completed',
  ),
) =>
  Effect.gen(function* () {
    yield* worker.work(queue, () =>
      Effect.gen(function* () {
        yield* Deferred.succeed(gates.started, undefined);
        yield* Deferred.await(gates.held);
        return yield* outcome;
      }),
    );
    const running = yield* Effect.forkChild(worker.drainOnce(queue));
    yield* Deferred.await(gates.started);
    return running;
  });

export type Holder = {
  readonly query: (
    statement: string,
    parameters?: readonly string[],
  ) => Effect.Effect<void>;
  readonly blockedByMe: Effect.Effect<number>;
  readonly finish: (how: 'COMMIT' | 'ROLLBACK') => Effect.Effect<void>;
};

export const holding = <A, E, R>(
  url: string,
  use: (holder: Holder) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Scope.make(),
    (scope) =>
      Effect.flatMap(
        Scope.provide(scope)(
          Effect.gen(function* () {
            const { sql } = Context.get(
              yield* Effect.orDie(
                Layer.build(
                  OwnerDatabase.layer({
                    url,
                    maxConnections: 1,
                    applicationName: 'studio-test-holder',
                  }),
                ),
              ),
              OwnerDatabase,
            );
            const held = yield* Effect.orDie(sql.reserve);
            yield* Effect.acquireRelease(
              Effect.orDie(held.executeRaw('BEGIN', [])),
              () => Effect.ignore(held.executeRaw('ROLLBACK', [])),
            );
            return held;
          }),
        ),
        (held) =>
          use({
            query: (statement, parameters) =>
              Effect.orDie(held.executeRaw(statement, parameters ?? [])),
            blockedByMe: Effect.orDie(
              Effect.map(
                held.execute(
                  `SELECT count(*)::int AS blocked
                     FROM pg_stat_activity
                    WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))`,
                  [],
                  undefined,
                ),
                (rows: ReadonlyArray<{ readonly blocked?: number }>) =>
                  rows[0]?.blocked ?? 0,
              ),
            ),
            finish: (how) => Effect.orDie(held.executeRaw(how, [])),
          }),
      ),
    (scope, exit) => Scope.close(scope, exit),
  );

const CONDITION_POLL = '20 millis';

export const awaitAnswer = <A, E, R>(
  read: Effect.Effect<A, E, R>,
  accept: (value: A) => boolean,
  within: Duration.Duration,
  poll: Duration.Input = CONDITION_POLL,
): Effect.Effect<Option.Option<A>, E, R> =>
  Effect.gen(function* () {
    let answer = yield* read;
    while (!accept(answer)) {
      yield* Effect.sleep(poll);
      answer = yield* read;
    }
    return answer;
  }).pipe(Effect.timeoutOption(within));

export const awaitTrue = <E, R>(
  condition: Effect.Effect<boolean, E, R>,
  within: Duration.Duration,
  poll: Duration.Input = CONDITION_POLL,
): Effect.Effect<Option.Option<void>, E, R> =>
  Effect.map(
    awaitAnswer(condition, (met) => met, within, poll),
    (answer) => Option.map(answer, () => undefined),
  );

export const awaitJobState = (
  queue: JobQueueName,
  state: string,
  within: Duration.Duration,
) =>
  awaitAnswer(
    readJobs(queue),
    (rows) => rows[0]?.state === state,
    within,
    '10 millis',
  );

const NOTIFY_POLL_INTERVAL = Duration.hours(1);

export const NOTIFY_BUDGET = Duration.millis(500);

export const NOTIFY_SETTLE = Duration.millis(150);

export const layerNotifiedWorker = (listen: boolean) =>
  layerWorker({
    background: true,
    pollInterval: NOTIFY_POLL_INTERVAL,
    listen,
  });

export function payloadFor(queue: JobQueueName): JobPayload<JobQueueName> {
  if (queue === 'sign-in-email') {
    return {
      email: Redacted.make('researcher@example.org'),
      url: Redacted.make(
        'https://studio.example.org/api/auth/magic-link/verify?token=abc',
      ),
    };
  }
  if (queue.startsWith('invitation-delivery')) {
    return { deliveryId: randomUUID() };
  }
  return {};
}

export type DeliveryHarnessShape = QueueHarnessShape & {
  readonly studioSchema: string;
};

export class DeliveryHarness extends Context.Service<
  DeliveryHarness,
  DeliveryHarnessShape
>()('@studio/jobs/test/DeliveryHarness') {}

export const layerDeliveryHarness: Layer.Layer<
  DeliveryHarness | QueueHarness | TestDatabase
> = Layer.effectContext(
  Effect.map(TestDatabase, (harness) => {
    const shape: DeliveryHarnessShape = {
      schema: harness.jobSchema,
      studioSchema: harness.schema,
      app: harness.app,
      maintenance: harness.maintenance,
      owner: harness.owner,
    };
    return Context.make(DeliveryHarness, DeliveryHarness.of(shape)).pipe(
      Context.add(QueueHarness, QueueHarness.of(shape)),
      Context.add(TestDatabase, harness),
    );
  }),
).pipe(Layer.provide(TestDatabaseLive));
