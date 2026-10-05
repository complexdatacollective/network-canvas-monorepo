import {
  Cause,
  Context,
  Cron,
  DateTime,
  Duration,
  Effect,
  Exit,
  Latch,
  Layer,
  MutableRef,
  Option,
  Predicate,
  Queue,
  Random,
  Result,
  Schedule,
  Schema,
  Semaphore,
} from 'effect';
import type { SqlClient, SqlError } from 'effect/sql';

import type { JobPayload, JobQueueName } from '@codaco/studio-sync/jobs';

import { MaintenanceDatabase } from '../db/client.ts';
import { MaintenanceScope, Transaction } from '../db/tenant.ts';
import { JobClock, type JobClockShape } from './clock.ts';
import {
  causeError,
  deepestMessage,
  isUniqueViolationCause,
} from './errors.ts';
import { Jobs, type JobId } from './jobs.ts';
import {
  isDeclaredQueueName,
  payloadCodec,
  type ResolvedQueue,
  resolvedQueue,
  resolvedQueues,
} from './queues.ts';
import { assertSchemaName, type JobState, jobNotifyChannel } from './schema.ts';

export type JobOutcome = 'completed' | 'suppressed' | 'uncertain';

export type HandledJob<Queue extends JobQueueName> = {
  readonly id: JobId;
  readonly queue: Queue;
  readonly payload: JobPayload<Queue>;
  readonly attempt: number;
  readonly finalAttempt: boolean;
};

export type JobHandler<Queue extends JobQueueName, E, R> = (
  job: HandledJob<Queue>,
) => Effect.Effect<JobOutcome, E, R>;

class JobPayloadUndecodable extends Schema.TaggedError<JobPayloadUndecodable>()(
  'JobPayloadUndecodable',
  { queue: Schema.String, jobId: Schema.String, message: Schema.String },
) {}

export type JobStep =
  | { readonly _tag: 'idle' }
  | {
      readonly _tag: 'settled';
      readonly jobId: JobId;
      readonly outcome: JobOutcome;
    }
  | {
      readonly _tag: 'retrying';
      readonly jobId: JobId;
      readonly attempt: number;
      readonly runAt: DateTime.Utc;
    }
  | {
      readonly _tag: 'failed';
      readonly jobId: JobId;
      readonly attempt: number;
      readonly deadLetter: JobId | null;
    }
  | { readonly _tag: 'dead'; readonly jobId: JobId };

export type QueueDepth = {
  readonly queue: string;
  readonly state: JobState;
  readonly count: number;
};

export type JobWorkerConfig = {
  readonly schema: string;
  readonly pollInterval?: Duration.Input | undefined;
  readonly reaperInterval?: Duration.Input | undefined;
  readonly retentionInterval?: Duration.Input | undefined;
  readonly cronInterval?: Duration.Input | undefined;
  readonly stopTimeout?: Duration.Input | undefined;
  readonly maxInFlight?: number | undefined;
  readonly listen?: boolean | undefined;
  readonly background?: boolean | undefined;
  readonly startPaused?: boolean | undefined;
};

/** A terminal row is deleted only on this sweep, so a shorter `deleteAfterSeconds` is not honoured. */
export const RETENTION_INTERVAL = Duration.seconds(60);

const DEFAULTS = {
  pollInterval: Duration.seconds(2),
  reaperInterval: Duration.seconds(30),
  retentionInterval: RETENTION_INTERVAL,
  cronInterval: Duration.seconds(15),
  stopTimeout: Duration.seconds(25),
  maxInFlight: 8,
} as const;

const CRON_LOCK_CLASS = 402177;

const MAX_ERROR_LENGTH = 1_000;

const LEASE_EXPIRED = 'the attempt did not finish before its lease expired';

export const EXPIRY_BATCH_SIZE = 200;

const declaredQueues: ReadonlyMap<string, ResolvedQueue> = new Map(
  resolvedQueues.map((declaration) => [declaration.name, declaration]),
);

const frozenLadder = (frozen: FrozenPolicy) => ({
  retryDelay: frozen.retry_delay,
  retryBackoff: frozen.retry_backoff,
  retryDelayMax: frozen.retry_delay_max,
});

type FrozenPolicy = {
  readonly retry_limit: number;
  readonly retry_delay: number;
  readonly retry_backoff: boolean;
  readonly retry_delay_max: number | null;
};

type ClaimedRow = FrozenPolicy & {
  readonly id: string;
  readonly payload: unknown;
  readonly attempts: number;
};

type ExpiredRow = FrozenPolicy & {
  readonly id: string;
  readonly queue: string;
  readonly attempts: number;
};

type RegisteredHandler = (job: {
  readonly id: JobId;
  readonly payload: unknown;
  readonly attempt: number;
  readonly finalAttempt: boolean;
}) => Effect.Effect<JobOutcome, unknown>;

export class JobWorker extends Context.Service<
  JobWorker,
  {
    readonly work: <Queue extends JobQueueName, E, R>(
      queue: Queue,
      handler: JobHandler<Queue, E, R>,
    ) => Effect.Effect<void, never, R>;
    readonly schedule: <Queue extends JobQueueName>(
      name: string,
      cron: string,
      queue: Queue,
      payload: JobPayload<Queue>,
    ) => Effect.Effect<
      void,
      Cron.CronParseError | SqlError.SqlError,
      MaintenanceDatabase
    >;
    readonly dropUndeclaredSchedules: (
      names: readonly string[],
    ) => Effect.Effect<
      readonly string[],
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    readonly ready: Effect.Effect<boolean>;
    readonly listening: Effect.Effect<Option.Option<boolean>>;
    readonly setFetching: (fetching: boolean) => Effect.Effect<void>;
    readonly queueDepths: Effect.Effect<
      readonly QueueDepth[],
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    readonly drainOnce: (
      queue: JobQueueName,
    ) => Effect.Effect<JobStep, SqlError.SqlError, MaintenanceDatabase>;
    readonly reapExpired: Effect.Effect<
      number,
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    readonly deleteExpired: Effect.Effect<
      number,
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    readonly tickSchedules: Effect.Effect<
      boolean,
      SqlError.SqlError,
      MaintenanceDatabase | Jobs
    >;
  }
>()('@studio/jobs/JobWorker') {
  static readonly layer = (
    config: JobWorkerConfig,
  ): Layer.Layer<JobWorker, never, MaintenanceDatabase | Jobs> =>
    Layer.effect(JobWorker, make(config));
}

export const returnToQueue = Effect.fnUntraced(function* (
  schema: string,
  jobId: JobId,
  attempts: number,
) {
  const { sql } = yield* Transaction;
  const returned = yield* sql<{ id: string }>`
    UPDATE ${sql(schema)}.jobs
       SET state = 'created', attempts = attempts - 1, locked_until = NULL
     WHERE id = ${jobId}
       AND state = 'active'
       AND attempts = ${attempts}
    RETURNING id`;
  return returned.length === 1;
});

const make = Effect.fnUntraced(function* (config: JobWorkerConfig) {
  const schema = assertSchemaName(config.schema);
  const registry = new Map<JobQueueName, RegisteredHandler>();
  const fetching = MutableRef.make(config.startPaused !== true);
  const started = MutableRef.make(false);
  const wake = new Map<JobQueueName, Latch.Latch>(
    resolvedQueues.map((declaration) => [
      declaration.name,
      Latch.makeUnsafe(true),
    ]),
  );
  const listening = MutableRef.make(false);
  const maxInFlight = config.maxInFlight ?? DEFAULTS.maxInFlight;
  const inFlight = Semaphore.makeUnsafe(maxInFlight);
  const clock: JobClockShape = yield* JobClock;

  const table = (sql: SqlClient.SqlClient) => sql(schema);

  const work = Effect.fnUntraced(function* <Queue extends JobQueueName, E, R>(
    queue: Queue,
    handler: JobHandler<Queue, E, R>,
  ) {
    const services = yield* Effect.context<R>();
    const codec = payloadCodec(queue);
    registry.set(queue, (raw) =>
      codec.decode(raw.payload).pipe(
        Effect.catch((issue) =>
          Effect.fail(
            new JobPayloadUndecodable({
              queue,
              jobId: raw.id,
              message: String(issue),
            }),
          ),
        ),
        Effect.flatMap((payload) =>
          Effect.provideContext(
            handler({
              id: raw.id,
              queue,
              payload,
              attempt: raw.attempt,
              finalAttempt: raw.finalAttempt,
            }),
            services,
          ),
        ),
      ),
    );
  });

  const claim = Effect.fnUntraced(function* (
    queue: JobQueueName,
    now: DateTime.Utc,
  ) {
    const declaration = resolvedQueue(queue);
    const { sql } = yield* Transaction;
    const at = DateTime.toDate(now);
    // Only an optimisation: `jobs_singleton_active_idx` is what enforces it.
    const singletonGuard =
      declaration.policy === 'singleton'
        ? sql`AND NOT EXISTS (
                SELECT 1 FROM ${table(sql)}.jobs live
                 WHERE live.queue = ${queue} AND live.state = 'active')`
        : sql.literal('');
    const rows = yield* sql<ClaimedRow>`
      UPDATE ${table(sql)}.jobs
         SET state = 'active',
             -- The lease off the row rather than the declaration, so a job
             -- keeps the expiry it was enqueued under.
             locked_until = ${at}::timestamptz
                            + make_interval(secs => expire_in_seconds),
             attempts = attempts + 1
       WHERE id = (
         SELECT id
           FROM ${table(sql)}.jobs
          WHERE queue = ${queue}
            AND state = 'created'
            AND run_at <= ${at}
            ${singletonGuard}
          ORDER BY run_at, created_at
            FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
      RETURNING id, payload, attempts,
                retry_limit, retry_delay, retry_backoff, retry_delay_max`;
    return rows[0];
  });

  /** `state = 'active' AND attempts = <the claim's own>` makes a stale attempt's write miss once the reaper has returned the row. */
  const settleSuccess = Effect.fnUntraced(function* (
    jobId: JobId,
    attempts: number,
    outcome: JobOutcome,
    now: DateTime.Utc,
  ) {
    const { sql } = yield* Transaction;
    const settled = yield* sql<{ id: string }>`
      UPDATE ${table(sql)}.jobs
         SET state = 'completed',
             outcome = ${outcome},
             completed_at = ${DateTime.toDate(now)},
             locked_until = NULL,
             last_error = NULL
       WHERE id = ${jobId}
         AND state = 'active'
         AND attempts = ${attempts}
      RETURNING id`;
    return settled.length === 1;
  });

  const settleDead = Effect.fnUntraced(function* (
    jobId: JobId,
    attempts: number,
    message: string,
    now: DateTime.Utc,
  ) {
    const { sql } = yield* Transaction;
    const settled = yield* sql<{ id: string }>`
      UPDATE ${table(sql)}.jobs
         SET state = 'dead',
             completed_at = ${DateTime.toDate(now)},
             locked_until = NULL,
             last_error = ${message}
       WHERE id = ${jobId}
         AND state = 'active'
         AND attempts = ${attempts}
      RETURNING id`;
    return settled.length === 1;
  });

  const settleFailure = Effect.fnUntraced(function* (
    queue: JobQueueName,
    jobId: JobId,
    attempts: number,
    frozen: FrozenPolicy,
    message: string,
    now: DateTime.Utc,
  ) {
    const declaration = resolvedQueue(queue);
    const { sql } = yield* Transaction;

    if (attempts <= frozen.retry_limit) {
      const delay = yield* backoffSeconds(frozenLadder(frozen), attempts);
      const runAt = DateTime.addDuration(now, Duration.seconds(delay));
      const keepUntil = DateTime.addDuration(
        runAt,
        Duration.seconds(declaration.retentionSeconds),
      );
      const retried = yield* sql<{ id: string }>`
        UPDATE ${table(sql)}.jobs
           SET state = 'created',
               run_at = ${DateTime.toDate(runAt)},
               keep_until = ${DateTime.toDate(keepUntil)},
               locked_until = NULL,
               last_error = ${message}
         WHERE id = ${jobId}
           AND state = 'active'
           AND attempts = ${attempts}
        RETURNING id`;
      if (retried.length !== 1) return null;
      const step: JobStep = {
        _tag: 'retrying',
        jobId,
        attempt: attempts,
        runAt,
      };
      return step;
    }

    const failed = yield* sql<{ id: string }>`
      UPDATE ${table(sql)}.jobs
         SET state = 'failed',
             completed_at = ${DateTime.toDate(now)},
             locked_until = NULL,
             last_error = ${message}
       WHERE id = ${jobId}
         AND state = 'active'
         AND attempts = ${attempts}
      RETURNING id`;
    if (failed.length !== 1) return null;

    const deadLetter = declaration.deadLetter;
    if (deadLetter === null) {
      const step: JobStep = {
        _tag: 'failed',
        jobId,
        attempt: attempts,
        deadLetter: null,
      };
      return step;
    }

    const target = resolvedQueue(deadLetter);
    const keepUntil = DateTime.addDuration(
      now,
      Duration.seconds(target.retentionSeconds),
    );
    const copied = yield* sql<{ id: string }>`
      INSERT INTO ${table(sql)}.jobs
        (queue, payload, state, policy, attempts, singleton_key,
         retry_limit, retry_delay, retry_backoff, retry_delay_max,
         expire_in_seconds, run_at, keep_until, created_at, dead_letter_of)
      SELECT ${deadLetter},
             payload,
             'created',
             ${target.policy},
             0,
             NULL,
             ${target.retryLimit},
             ${target.retryDelay},
             ${target.retryBackoff},
             ${target.retryDelayMax},
             ${target.expireInSeconds},
             ${DateTime.toDate(now)},
             ${DateTime.toDate(keepUntil)},
             ${DateTime.toDate(now)},
             id
        FROM ${table(sql)}.jobs
       WHERE id = ${jobId}
      ON CONFLICT DO NOTHING
      RETURNING id`;
    const step: JobStep = {
      _tag: 'failed',
      jobId,
      attempt: attempts,
      deadLetter: copied[0]?.id ?? null,
    };
    return step;
  });

  const leaseLost = (queue: JobQueueName, jobId: JobId, attempt: number) =>
    Effect.logWarning(
      `job ${queue} ${jobId} lost its lease before attempt ${attempt} could settle; the row belongs to a later attempt`,
    );

  const drainOnce = Effect.fn('JobWorker.drainOnce')(
    function* (queue: JobQueueName) {
      const idle: JobStep = { _tag: 'idle' };
      // Re-read inside the permit, so a fiber that waited for one claims nothing during
      // the stop window.
      if (!MutableRef.get(fetching)) return idle;
      const now = yield* clock.now;
      const claimedOrRaced = yield* Effect.exit(
        MaintenanceScope.open(claim(queue, now)),
      );
      if (
        Exit.isFailure(claimedOrRaced) &&
        !isUniqueViolationCause(claimedOrRaced.cause)
      ) {
        return yield* Effect.failCause(claimedOrRaced.cause);
      }
      MutableRef.set(started, true);
      if (Exit.isFailure(claimedOrRaced)) return idle;
      const claimed = claimedOrRaced.value;
      if (claimed === undefined) return idle;

      const jobId: JobId = claimed.id;
      const handler = registry.get(queue);
      if (handler === undefined) {
        const returned = yield* MaintenanceScope.open(
          returnToQueue(schema, jobId, claimed.attempts),
        );
        if (!returned) yield* leaseLost(queue, jobId, claimed.attempts);
        return idle;
      }

      // Outside the claim's transaction: holding one open across a network call starves the pool.
      const exit = yield* Effect.exit(
        handler({
          id: jobId,
          payload: claimed.payload,
          attempt: claimed.attempts,
          finalAttempt: claimed.attempts > claimed.retry_limit,
        }),
      );

      const settledAt = yield* clock.now;
      if (Exit.isSuccess(exit)) {
        const fenced = yield* MaintenanceScope.open(
          settleSuccess(jobId, claimed.attempts, exit.value, settledAt),
        );
        if (!fenced) {
          yield* leaseLost(queue, jobId, claimed.attempts);
          return idle;
        }
        yield* exit.value === 'uncertain'
          ? Effect.logWarning(
              `job ${queue} ${jobId} ended uncertain on attempt ${claimed.attempts}: a side effect left the process and its record could not be written`,
            )
          : Effect.logDebug(
              `job ${queue} ${jobId} ${exit.value} on attempt ${claimed.attempts}`,
            );
        const settled: JobStep = {
          _tag: 'settled',
          jobId,
          outcome: exit.value,
        };
        return settled;
      }

      const error = causeError(exit.cause);
      if (Predicate.isTagged(error, 'JobPayloadUndecodable')) {
        const fenced = yield* MaintenanceScope.open(
          settleDead(jobId, claimed.attempts, describe(error), settledAt),
        );
        if (!fenced) {
          yield* leaseLost(queue, jobId, claimed.attempts);
          return idle;
        }
        yield* Effect.logError(
          `job ${queue} ${jobId} carries a payload this queue does not declare`,
        );
        const dead: JobStep = { _tag: 'dead', jobId };
        return dead;
      }

      const message = describe(error);
      const step = yield* MaintenanceScope.open(
        settleFailure(
          queue,
          jobId,
          claimed.attempts,
          claimed,
          message,
          settledAt,
        ),
      );
      if (step === null) {
        yield* leaseLost(queue, jobId, claimed.attempts);
        return idle;
      }
      yield* step._tag === 'retrying'
        ? Effect.logWarning(
            `job ${queue} ${jobId} retrying after attempt ${claimed.attempts}: ${message}`,
          )
        : Effect.logError(
            `job ${queue} ${jobId} failed on attempt ${claimed.attempts}: ${message}`,
          );
      return step;
    },
    // The whole step holds a permit, so a graceful stop cannot interrupt before the
    // outcome is written.
    (effect) => inFlight.withPermit(effect),
  );

  /** The loop reads the count settled, not seen: a row this build cannot settle would otherwise be re-read forever. */
  const reapExpired = Effect.fn('JobWorker.reapExpired')(function* () {
    const now = yield* clock.now;
    const at = DateTime.toDate(now);
    const onePass = Effect.gen(function* () {
      const { sql } = yield* Transaction;
      const expired = yield* sql<ExpiredRow>`
          SELECT id, queue, attempts,
                 retry_limit, retry_delay, retry_backoff, retry_delay_max
            FROM ${table(sql)}.jobs
           WHERE state = 'active'
             AND locked_until <= ${at}
           ORDER BY locked_until
             FOR UPDATE SKIP LOCKED
           LIMIT ${EXPIRY_BATCH_SIZE}`;
      let reaped = 0;
      for (const row of expired) {
        const declaration = declaredQueues.get(row.queue);
        if (declaration === undefined) {
          yield* Effect.logError(
            `job ${row.id} sits on ${row.queue}, which no queue declares; its expired lease cannot be settled`,
          );
          continue;
        }
        const step = yield* settleFailure(
          declaration.name,
          row.id,
          row.attempts,
          row,
          LEASE_EXPIRED,
          now,
        );
        if (step !== null) reaped += 1;
      }
      return reaped;
    });

    let settled = 0;
    for (;;) {
      const reaped = yield* MaintenanceScope.open(onePass);
      settled += reaped;
      if (reaped < EXPIRY_BATCH_SIZE) return settled;
    }
  });

  const deleteExpired = Effect.fn('JobWorker.deleteExpired')(function* () {
    const now = yield* clock.now;
    return yield* MaintenanceScope.open(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        let deleted = 0;
        for (const declaration of resolvedQueues) {
          const cutoff = DateTime.subtractDuration(
            now,
            Duration.seconds(declaration.deleteAfterSeconds),
          );
          const rows = yield* sql<{ id: string }>`
            DELETE FROM ${table(sql)}.jobs
             WHERE queue = ${declaration.name}
               AND (
                 (${declaration.deleteAfterSeconds} > 0
                   AND state IN ('completed', 'failed', 'dead')
                   AND completed_at <= ${DateTime.toDate(cutoff)})
                 OR (state = 'created'
                   AND keep_until <= ${DateTime.toDate(now)})
               )
            RETURNING id`;
          deleted += rows.length;
        }
        return deleted;
      }),
    );
  });

  const schedule = Effect.fnUntraced(function* <Queue extends JobQueueName>(
    name: string,
    cron: string,
    queue: Queue,
    payload: JobPayload<Queue>,
  ) {
    const parsed = Cron.parse(cron, 'UTC');
    if (Result.isFailure(parsed)) return yield* Effect.fail(parsed.failure);
    const now = yield* clock.now;
    const encoded = yield* Effect.orDie(payloadCodec(queue).decode(payload));
    const nextRunAt = Cron.next(parsed.success, DateTime.toDate(now));
    yield* MaintenanceScope.open(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        // `next_run_at` is left alone unless the cron expression changed: recomputing it
        // would skip an occurrence that has already come due.
        yield* sql`
          INSERT INTO ${table(sql)}.job_schedules
            (name, cron, queue, payload, next_run_at)
          VALUES (${name}, ${cron}, ${queue},
                  ${JSON.stringify(encoded)}::jsonb, ${nextRunAt})
          ON CONFLICT (name) DO UPDATE
            SET cron = excluded.cron,
                queue = excluded.queue,
                payload = excluded.payload,
                next_run_at = CASE
                  WHEN job_schedules.cron IS DISTINCT FROM excluded.cron
                  THEN excluded.next_run_at
                  ELSE job_schedules.next_run_at END`;
      }),
    );
  });

  const dropUndeclaredSchedules = Effect.fnUntraced(function* (
    names: readonly string[],
  ) {
    return yield* MaintenanceScope.open(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        const rows = yield* sql<{
          name: string;
        }>`SELECT name FROM ${table(sql)}.job_schedules ORDER BY name`;
        const dropped: string[] = [];
        for (const row of rows) {
          if (names.includes(row.name)) continue;
          yield* sql`DELETE FROM ${table(sql)}.job_schedules WHERE name = ${row.name}`;
          dropped.push(row.name);
        }
        const answer: readonly string[] = dropped;
        return answer;
      }),
    );
  });

  const tickSchedules = Effect.fn('JobWorker.tickSchedules')(function* () {
    const now = yield* clock.now;
    const jobs = yield* Jobs;
    return yield* MaintenanceScope.open(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        const held = yield* sql<{ locked: boolean }>`
          SELECT pg_try_advisory_xact_lock(${CRON_LOCK_CLASS}, hashtext(${schema})) AS locked`;
        if (held[0]?.locked !== true) return false;

        const due = yield* sql<{
          name: string;
          cron: string;
          queue: string;
          payload: unknown;
        }>`
          SELECT name, cron, queue, payload
            FROM ${table(sql)}.job_schedules
           WHERE next_run_at <= ${DateTime.toDate(now)}
           ORDER BY name
             FOR UPDATE`;

        for (const row of due) {
          const parsed = Cron.parse(row.cron, 'UTC');
          if (Result.isFailure(parsed)) {
            yield* Effect.logError(
              `schedule ${row.name} carries an unparseable cron ${row.cron}`,
            );
            continue;
          }
          // Left due rather than advanced, like an unparseable cron: once boot repairs
          // the row, the occurrence it missed still runs.
          if (!isDeclaredQueueName(row.queue)) {
            yield* Effect.logError(
              `schedule ${row.name} names a queue this build does not declare: ${row.queue}`,
            );
            continue;
          }
          const decoded = yield* Effect.exit(
            payloadCodec(row.queue).decode(row.payload),
          );
          if (Exit.isFailure(decoded)) {
            yield* Effect.logError(
              `schedule ${row.name} carries a payload that does not decode: ${describe(causeError(decoded.cause))}`,
            );
            continue;
          }
          const nextRunAt = Cron.next(parsed.success, DateTime.toDate(now));
          yield* sql`
            UPDATE ${table(sql)}.job_schedules
               SET next_run_at = ${nextRunAt}
             WHERE name = ${row.name}`;
          // Under the schedule's own name as a singleton key, which bounds a schedule's
          // backlog at one unfinished occurrence.
          const enqueued = yield* Effect.exit(
            jobs.enqueue(row.queue, decoded.value, {
              singletonKey: row.name,
            }),
          );
          if (Exit.isFailure(enqueued)) {
            yield* Effect.logInfo(
              `schedule ${row.name} did not enqueue: ${describe(causeError(enqueued.cause))}`,
            );
          }
        }
        return true;
      }),
    );
  });

  const queueDepths = Effect.fnUntraced(function* () {
    const depths: readonly QueueDepth[] = yield* MaintenanceScope.open(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        // `count(*)::int`: a bare `count(*)` decodes as a `bigint`.
        return yield* sql<QueueDepth>`
          SELECT queue, state, count(*)::int AS count
            FROM ${table(sql)}.jobs
           GROUP BY queue, state
           ORDER BY queue, state`;
      }),
    );
    MutableRef.set(started, true);
    return depths;
  });

  const listens = config.background !== false && config.listen !== false;

  const service = JobWorker.of({
    work,
    schedule,
    dropUndeclaredSchedules,
    ready: Effect.sync(() => MutableRef.get(started)),
    listening: Effect.sync((): Option.Option<boolean> =>
      listens ? Option.some(MutableRef.get(listening)) : Option.none(),
    ),
    setFetching: (value) =>
      Effect.gen(function* () {
        MutableRef.set(fetching, value);
        if (!value) return;
        for (const latch of wake.values()) yield* latch.open;
      }),
    queueDepths: queueDepths(),
    drainOnce,
    reapExpired: reapExpired(),
    deleteExpired: deleteExpired(),
    tickSchedules: tickSchedules(),
  });

  if (config.background === false) return service;

  yield* forkBackground(service, config, schema, {
    fetching,
    wake,
    inFlight,
    maxInFlight,
    registry,
    listening,
  });
  return service;
});

/** The stop is added after the forks so it runs before their interruption: scope finalizers run in reverse. */
const forkBackground = Effect.fnUntraced(function* (
  worker: JobWorker['Service'],
  config: JobWorkerConfig,
  schema: string,
  state: {
    readonly fetching: MutableRef.MutableRef<boolean>;
    readonly wake: ReadonlyMap<JobQueueName, Latch.Latch>;
    readonly inFlight: Semaphore.Semaphore;
    readonly maxInFlight: number;
    readonly registry: ReadonlyMap<JobQueueName, unknown>;
    readonly listening: MutableRef.MutableRef<boolean>;
  },
) {
  const { wake } = state;

  const pollQueue = (queue: JobQueueName, latch: Latch.Latch) =>
    Effect.gen(function* () {
      // Closed before the drain, or a notification during it would be swallowed.
      yield* latch.close;
      if (!MutableRef.get(state.fetching)) {
        if (!(yield* worker.ready)) yield* worker.queueDepths;
        return;
      }
      // Not claimed from: putting the row back would fire the trigger and wake this
      // fiber again, a livelock.
      if (!state.registry.has(queue)) return;
      let step = yield* worker.drainOnce(queue);
      while (step._tag !== 'idle') {
        if (!MutableRef.get(state.fetching)) return;
        step = yield* worker.drainOnce(queue);
      }
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError(`job poll for ${queue} failed: ${Cause.pretty(cause)}`),
      ),
      (drain) =>
        Effect.forever(
          Effect.flatMap(
            Effect.race(
              latch.await,
              Effect.sleep(config.pollInterval ?? DEFAULTS.pollInterval),
            ),
            () => drain,
          ),
        ),
    );

  const periodic = <A, E, R>(
    interval: Duration.Input,
    effect: Effect.Effect<A, E, R>,
    label: string,
  ) =>
    effect.pipe(
      Effect.catchCause((cause) =>
        Effect.logError(`${label} failed: ${Cause.pretty(cause)}`),
      ),
      Effect.repeat(Schedule.spaced(interval)),
    );

  if (config.listen !== false) {
    yield* forkListener(schema, wake, state.listening);
  }

  for (const [queue, latch] of wake) {
    yield* Effect.forkScoped(pollQueue(queue, latch));
  }
  yield* Effect.forkScoped(
    periodic(
      config.reaperInterval ?? DEFAULTS.reaperInterval,
      worker.reapExpired,
      'the expiry reaper',
    ),
  );
  yield* Effect.forkScoped(
    periodic(
      config.retentionInterval ?? DEFAULTS.retentionInterval,
      worker.deleteExpired,
      'the retention pass',
    ),
  );
  yield* Effect.forkScoped(
    periodic(
      config.cronInterval ?? DEFAULTS.cronInterval,
      worker.tickSchedules,
      'the cron tick',
    ),
  );

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      MutableRef.set(state.fetching, false);
      const drained = yield* Effect.timeoutOption(
        state.inFlight.withPermits(state.maxInFlight)(Effect.void),
        config.stopTimeout ?? DEFAULTS.stopTimeout,
      );
      if (Option.isNone(drained)) {
        yield* Effect.logWarning(
          'the job worker stopped with handlers still in flight; they are being interrupted',
        );
      }
    }),
  );
});

const LISTEN_RETRY_BASE = Duration.millis(200);

const LISTEN_RETRY_CAP = Duration.seconds(30);

const listenRetryDelay = (consecutiveLosses: number): Duration.Duration =>
  Duration.min(
    LISTEN_RETRY_CAP,
    Duration.times(
      LISTEN_RETRY_BASE,
      2 ** Math.min(8, Math.max(0, consecutiveLosses - 1)),
    ),
  );

/** Retried forever: `PgConnection.fatal` ends the take loop with `Cause.interrupt()` rather than an error. */
const forkListener = Effect.fnUntraced(function* (
  schema: string,
  wake: ReadonlyMap<string, Latch.Latch>,
  listening: MutableRef.MutableRef<boolean>,
) {
  const { sql } = yield* MaintenanceDatabase;
  const channel = jobNotifyChannel(schema);
  const losses = MutableRef.make(0);

  const session = Effect.gen(function* () {
    const notifications = yield* sql.listen(channel);
    MutableRef.set(listening, true);
    const recovered = MutableRef.getAndSet(losses, 0);
    yield* recovered === 0
      ? Effect.logInfo(`job listener acquired on ${channel}`)
      : Effect.logInfo(
          `job listener re-acquired on ${channel} after ${recovered} consecutive losses`,
        );
    return yield* Effect.forever(
      Effect.flatMap(Queue.take(notifications), (notification) => {
        const latch = wake.get(notification.payload);
        return latch === undefined ? Effect.void : latch.open;
      }),
    );
  }).pipe(Effect.scoped);

  const lost = (cause: Cause.Cause<unknown>) =>
    Effect.suspend(() => {
      MutableRef.set(listening, false);
      const consecutive = MutableRef.incrementAndGet(losses);
      const reconnecting = `reconnecting in ${Duration.toMillis(listenRetryDelay(consecutive))}ms`;
      return consecutive === 1
        ? Effect.logWarning(
            `job listener lost; ${reconnecting}: ${Cause.pretty(cause)}`,
          )
        : Effect.logDebug(
            `job listener still down after ${consecutive} consecutive losses; ${reconnecting}: ${Cause.pretty(cause)}`,
          );
    });

  const backoff = Schedule.modifyDelay(Schedule.forever, () =>
    Effect.succeed(listenRetryDelay(MutableRef.get(losses))),
  );

  yield* Effect.forkScoped(
    session.pipe(Effect.catchCause(lost), Effect.repeat(backoff)),
  );
});

export const backoffSeconds = Effect.fnUntraced(function* (
  declaration: {
    readonly retryDelay: number;
    readonly retryBackoff: boolean;
    readonly retryDelayMax: number | null;
  },
  attempts: number,
) {
  if (!declaration.retryBackoff) return declaration.retryDelay;
  const exponent = Math.min(16, attempts);
  const roll = yield* Random.next;
  const delay =
    Math.max(declaration.retryDelay, 1) *
    (2 ** exponent / 2 + (2 ** exponent / 2) * roll);
  return declaration.retryDelayMax === null
    ? delay
    : Math.min(declaration.retryDelayMax, delay);
});

const describe = (error: unknown): string =>
  (deepestMessage(error) ?? String(error)).slice(0, MAX_ERROR_LENGTH);
