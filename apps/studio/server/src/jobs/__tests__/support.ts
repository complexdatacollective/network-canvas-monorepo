import { randomUUID } from 'node:crypto';

import {
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
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

// One scratch job schema per suite, with a client per identity, built from the
// three tags stage 3 owns: `Database` (the application role), then
// `MaintenanceDatabase` and `OwnerDatabase` (src/db/client.ts).
//
// The queue is maintenance work, so every scope it opens is a
// `MaintenanceScope` and reads the `MaintenanceDatabase` tag. `asApp` /
// `asMaintenance` / `asOwner` below therefore put the *chosen* identity's
// client under that one tag: it is how one scope function is exercised as each
// of the three roles, and it is what lets `grants.test.ts` assert what
// `studio_app` may not do with a job. A harness-only substitution — the worker
// program provides the maintenance client and nothing else.

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

/**
 * `@effect/sql-pg` refuses every multi-command string with `42601`, so the
 * sidecar is split before it is sent — with stage 2a's dollar-quote-aware
 * splitter, which the `notify_job` trigger's plpgsql body now requires:
 * splitting on `;` would cut it in half.
 */
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

/**
 * A scratch schema with the queue installed, its grants applied, and a client
 * per identity. Dropped when the suite's layer scope closes.
 */
export const layerQueueHarness = (db: DbEnv): Layer.Layer<QueueHarness> =>
  Layer.effect(
    QueueHarness,
    Effect.gen(function* () {
      const schema = `studio_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
      // Built into this layer's own scope rather than `Effect.provide`d, which
      // would close each pool the moment the effect that built it finished.
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

/** Runs an effect as the role that serves requests. */
export const asApp = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaintenanceDatabase> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, MaintenanceDatabase, harness.app),
  );

/** Runs an effect as the role the worker runs as. */
export const asMaintenance = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaintenanceDatabase> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, MaintenanceDatabase, harness.maintenance),
  );

/** Runs an effect as the connecting login; the suites' oracle connection. */
export const asOwner = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaintenanceDatabase> | QueueHarness> =>
  Effect.flatMap(QueueHarness, (harness) =>
    Effect.provideService(effect, MaintenanceDatabase, harness.owner),
  );

/** The harness's maintenance client, for a worker layer. */
const layerMaintenanceDatabase: Layer.Layer<
  MaintenanceDatabase,
  never,
  QueueHarness
> = Layer.effect(
  MaintenanceDatabase,
  Effect.map(QueueHarness, (harness) => harness.maintenance),
);

/**
 * The worker as the suites build it: on the maintenance client, with every
 * background fiber unforked unless a case asks for them, so a case drives
 * `drainOnce` and the maintenance passes itself.
 */
export const layerWorker = (
  config: Omit<JobWorkerConfig, 'schema'> = {},
  /**
   * The clock the worker and its enqueues share. Defaults to the uncorrected
   * one `TestClock` drives; a case that wants to *be* a skewed replica passes
   * `JobClock.layerOffset(…)`.
   */
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

/** Every row of the queue, read as the owner — neither role may. */
export type JobRow = {
  readonly id: string;
  readonly queue: string;
  readonly state: string;
  readonly policy: string;
  readonly attempts: number;
  readonly payload: unknown;
  readonly singleton_key: string | null;
  /** The retry policy as it was frozen onto the row at enqueue. */
  readonly retry_limit: number;
  readonly retry_delay: number;
  readonly retry_backoff: boolean;
  readonly retry_delay_max: number | null;
  readonly expire_in_seconds: number;
  readonly last_error: string | null;
  readonly outcome: string | null;
  readonly dead_letter_of: string | null;
  /** rc.115 decodes `timestamptz` as epoch milliseconds. */
  readonly run_at: number;
  readonly keep_until: number;
  readonly locked_until: number | null;
  readonly completed_at: number | null;
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

// What nearly every suite in this directory needs of the queue beyond the
// harness itself: an empty table to start from, the `Jobs` layer on the
// suite's own schema, one job on it, an owner-side edit of a row, and the
// schedules. They are here rather than copied per file because a suite that
// wrote its own would be asserting against a fixture that had drifted from
// the one the case beside it uses — and because the four constants below are
// read by cases in six files that must mean the same job by them.

/** The delivery queue's declaration, which the cases assert against. */
export const DELIVERY = resolvedQueue('invitation-delivery');

/** The one delivery every suite that needs no second one addresses. */
export const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

/** A pinned seed, so the jittered backoff has one answer. */
export const SEED = 'studio-jobs';

/** What `reapExpired` writes to `last_error` in place of a handler's. */
export const LEASE_EXPIRED =
  'the attempt did not finish before its lease expired';

/** The `Jobs` service on the suite's own scratch schema. */
export const layerJobs: Layer.Layer<Jobs, never, QueueHarness> = Layer.unwrap(
  Effect.map(QueueHarness, (harness) => Jobs.layer({ schema: harness.schema })),
);

/**
 * Both of the queue's tables emptied, as the owner — the identity neither
 * production role may use — so a case starts from nothing whatever the case
 * before it left behind.
 */
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

/** One job, created by the application role in a transaction of its own. */
export const enqueue = <Queue extends JobQueueName>(
  queue: Queue,
  payload: JobPayload<Queue>,
  options?: EnqueueOptions,
) =>
  Effect.flatMap(Jobs, (jobs) =>
    asApp(MaintenanceScope.open(jobs.enqueue(queue, payload, options))),
  );

/** One job on the delivery queue, which is the queue most cases drive. */
export const enqueueDelivery = (
  deliveryId: string = DELIVERY_ID,
  options?: EnqueueOptions,
) => enqueue('invitation-delivery', { deliveryId }, options);

/** One job on the singleton sweep queue. */
export const enqueueSweep = enqueue('denied-attempts-summary', {});

/** An owner-side edit of a job row; the suites' stand-in for a redeploy. */
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
  readonly next_run_at: number;
};

/** Every schedule row, by name, read as the owner like `readJobs`. */
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

/**
 * Runs `body` against a worker of its own — a second replica, as far as the
 * database is concerned, since each `layerWorker()` builds its own service
 * with its own registry. Every case that reaches for a worker goes through
 * this or `drainWith`, so a case that means "another replica" cannot
 * accidentally get the same one twice.
 */
export const onWorker = <A, E, R>(
  body: (worker: JobWorker['Service']) => Effect.Effect<A, E, R>,
  config?: Omit<JobWorkerConfig, 'schema'>,
) => Effect.flatMap(JobWorker, body).pipe(Effect.provide(layerWorker(config)));

/**
 * One claim-run-settle step on a worker of its own, with `handler` registered
 * for the queue and nothing else — what nearly every case here means by
 * "the worker ran this job".
 */
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

/**
 * Claims one job on `worker` and leaves the handler blocked inside it, so the
 * case can move virtual time past the lease while the attempt is still
 * running. Answers the fiber running the step, so the case decides when — and
 * whether — the handler finishes.
 */
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

/** One statement on a held transaction, and the means to end it. */
export type Holder = {
  readonly query: (
    statement: string,
    parameters?: readonly string[],
  ) => Effect.Effect<void>;
  /** How many backends are waiting on a lock this transaction holds. */
  readonly blockedByMe: Effect.Effect<number>;
  readonly finish: (how: 'COMMIT' | 'ROLLBACK') => Effect.Effect<void>;
};

/**
 * An open transaction on a connection of its own, for the length of `use`: a
 * one-connection client built from `url` for this call alone, so the
 * harness's three clients share nothing with it, which is the point. A second
 * connection is the only way to hold a row lock — or an advisory one — that
 * the queue's own statements then have to deal with, and the transaction is
 * begun on a reserved connection rather than through `withTransaction`,
 * which would route every statement the calling fiber then ran through that
 * client onto the holder's connection instead.
 *
 * Always ended: a case that left a row locked would take every later case in
 * its file down with it, so the release rolls back whatever the case did not
 * finish itself, before the client and its connection are closed.
 */
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
              // The case ended the transaction itself, or the connection is
              // gone. Either way the lock is released, which is all this is
              // for.
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
                // `pg_backend_pid()` runs on this connection, so this counts
                // the backends blocked by *this* transaction and nothing else.
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

/** How often the waits below ask again. */
const CONDITION_POLL = '20 millis';

/**
 * Polls `read` until it answers something `accept` takes, or answers `None`
 * when the budget runs out. The wall-clock suites' one wait: a budget that
 * expires is the oracle in every one of them, so a wait that threw would turn
 * a failing assertion into a failing run with no verdict.
 */
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

/** The same wait, of a condition that is already a boolean. */
export const awaitTrue = <E, R>(
  condition: Effect.Effect<boolean, E, R>,
  within: Duration.Duration,
  poll: Duration.Input = CONDITION_POLL,
): Effect.Effect<Option.Option<void>, E, R> =>
  Effect.map(
    awaitAnswer(condition, (met) => met, within, poll),
    (answer) => Option.map(answer, () => undefined),
  );

/** Waits for the one job on a queue to reach a state, inside a budget. */
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

// What `notify.test.ts` and `listener.test.ts` measure the listener with.
// They are here rather than in each file because the second's oracle *is* the
// first's — a job settling inside the budget while the poll interval is an
// hour away — and two budgets that drifted apart would stop being one claim.

/** An hour, so nothing but a notification can explain a prompt drain. */
const NOTIFY_POLL_INTERVAL = Duration.hours(1);

/** What the notified worker must beat, and the unnotified one must not. */
export const NOTIFY_BUDGET = Duration.millis(500);

/**
 * Long enough for the worker's first poll pass — the wake latch starts open,
 * so a worker drains once at boot — to have happened and left the queue idle
 * before anything is enqueued. Without it a positive half could be a boot
 * drain rather than a notification, and a negative half could lose a race.
 */
export const NOTIFY_SETTLE = Duration.millis(150);

/** A forked worker that can only be woken promptly by a notification. */
export const layerNotifiedWorker = (listen: boolean) =>
  layerWorker({
    background: true,
    pollInterval: NOTIFY_POLL_INTERVAL,
    listen,
  });

/**
 * A valid payload per queue, so a case that visits every declaration has one
 * for each. The two scheduled sweeps visit everything there is; nothing
 * addresses them.
 */
export function payloadFor(queue: JobQueueName): JobPayload<JobQueueName> {
  if (queue === 'sign-in-email') {
    return {
      email: 'researcher@example.org',
      url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
    };
  }
  if (queue.startsWith('invitation-delivery')) {
    return { deliveryId: randomUUID() };
  }
  return {};
}

// The delivery suite needs Studio's own schema as well as the queue's, so it
// is built on `TestDatabaseLive`, which provisions both: the Studio scratch
// schema and its `_ejobs` job sibling, with a client per identity whose
// `search_path` resolves the unqualified Studio tables. The queue and the
// handler run on those clients, and `TestDatabase` is provided beside the
// harness for fixtures and oracles (`ownerRows`, `onOwner`).

export type DeliveryHarnessShape = QueueHarnessShape & {
  /** The Studio schema these clients resolve unqualified names against. */
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
