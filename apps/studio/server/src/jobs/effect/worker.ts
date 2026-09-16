import {
  Cause,
  Context,
  Cron,
  DateTime,
  Duration,
  Effect,
  Exit,
  Layer,
  MutableRef,
  Option,
  Predicate,
  Random,
  Result,
  Schedule,
  Schema,
  Semaphore,
} from 'effect';
import type { SqlClient, SqlError } from 'effect/unstable/sql';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { Database, Transaction, withTransaction } from './database.ts';
import { causeError, deepestMessage } from './errors.ts';
import { Jobs, type JobId } from './jobs.ts';
import {
  type JobPayload,
  payloadCodec,
  resolvedQueue,
  resolvedQueues,
  SINGLETON_QUEUE_KEY,
} from './queues.ts';
import { assertSchemaName, type JobState } from './schema.ts';

// The `JobWorker` row of #1927 §4, on the native queue: it claims, runs,
// settles, reaps, deletes and ticks the cron, and never binds a port.
//
// Everything that asks the time asks `Clock` (through `DateTime.now`) and
// passes the answer to Postgres as a parameter. pg-boss asks the database
// instead — `now()` is in every one of its plans — and that is the biggest
// structural difference between the two. An app-clock queue is `TestClock`-
// drivable end to end, which is what lets every case below run in virtual time
// against a real Postgres; it is also skew-sensitive across replicas, where
// pg-boss's is not. See the spike report.

/**
 * What a handler says happened, per #1927 §11. `retrying` and `failed` are
 * deliberately absent: a handler does not decide whether the queue will try
 * again. `drainOnce` logs those two from the job's own attempt counters.
 *
 * - `completed` — the work is done.
 * - `suppressed` — there was nothing to do; the reason belongs in the log, not
 *   in the error channel, because nothing failed.
 * - `uncertain` — a side effect left the process and its record could not be
 *   written. Terminal on purpose: a retry could repeat the side effect.
 */
export type JobOutcome = 'completed' | 'suppressed' | 'uncertain';

export type HandledJob<Queue extends JobQueueName> = {
  readonly id: JobId;
  readonly queue: Queue;
  readonly payload: JobPayload<Queue>;
  /** 1 on the first attempt; the row counts attempts, not retries. */
  readonly attempt: number;
  /** True when the queue will not try again after this one. */
  readonly finalAttempt: boolean;
};

export type JobHandler<Queue extends JobQueueName, E, R> = (
  job: HandledJob<Queue>,
) => Effect.Effect<JobOutcome, E, R>;

/**
 * A payload the queue's schema will not decode. No retry can fix it, and a
 * dead-letter copy would only carry it somewhere else, so the row goes to
 * `dead` and stops. A tagged failure rather than a defect, so the settling
 * code can tell it from a handler's own error without reading causes.
 */
class JobPayloadUndecodable extends Schema.TaggedError<JobPayloadUndecodable>()(
  'JobPayloadUndecodable',
  { queue: Schema.String, jobId: Schema.String, message: Schema.String },
) {}

/** What one claim-run-settle step did; the `JobWorkerInline` seam (§11). */
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
  /** How often an idle queue looks again. */
  readonly pollInterval?: Duration.Input | undefined;
  readonly reaperInterval?: Duration.Input | undefined;
  readonly retentionInterval?: Duration.Input | undefined;
  readonly cronInterval?: Duration.Input | undefined;
  /** How long a graceful stop waits for in-flight handlers. */
  readonly stopTimeout?: Duration.Input | undefined;
  /** Handlers in flight across every worked queue. */
  readonly maxInFlight?: number | undefined;
  /**
   * `false` leaves every background fiber unforked, so a suite drives
   * `drainOnce`, `reapExpired`, `deleteExpired` and `tickSchedules` itself.
   * This is `JobWorkerInline` (§11): the same code paths without a timer.
   */
  readonly background?: boolean | undefined;
};

const DEFAULTS = {
  pollInterval: Duration.seconds(2),
  reaperInterval: Duration.seconds(30),
  retentionInterval: Duration.seconds(60),
  cronInterval: Duration.seconds(15),
  stopTimeout: Duration.seconds(25),
  maxInFlight: 8,
} as const;

/**
 * One key for the whole cron tick. Taken with `pg_try_advisory_xact_lock`,
 * which the commit releases — a session lock held by a replica that died
 * mid-tick would otherwise stop every other replica until the connection was
 * reaped.
 */
const CRON_LOCK_KEY = 4021775688147131;

/** What is written to `last_error`; a longer message is cut. */
const MAX_ERROR_LENGTH = 1_000;

type ClaimedRow = {
  readonly id: string;
  readonly payload: unknown;
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
    ) => Effect.Effect<void, Cron.CronParseError | SqlError.SqlError, Database>;
    readonly dropUndeclaredSchedules: (
      names: readonly string[],
    ) => Effect.Effect<readonly string[], SqlError.SqlError, Database>;
    /** True once the worker has read the queue tables at least once. */
    readonly ready: Effect.Effect<boolean>;
    readonly setFetching: (fetching: boolean) => Effect.Effect<void>;
    readonly queueDepths: Effect.Effect<
      readonly QueueDepth[],
      SqlError.SqlError,
      Database
    >;
    /**
     * One claim-run-settle step, run to completion. This is what the poll
     * fibers call and what the suites drive directly.
     */
    readonly drainOnce: (
      queue: JobQueueName,
    ) => Effect.Effect<JobStep, SqlError.SqlError, Database>;
    /** One expiry pass; forked on a timer when `background` is not false. */
    readonly reapExpired: Effect.Effect<number, SqlError.SqlError, Database>;
    /** One retention pass; forked on a timer likewise. */
    readonly deleteExpired: Effect.Effect<number, SqlError.SqlError, Database>;
    /**
     * One cron pass. `false` means another replica held the advisory lock,
     * which is the only other outcome a second worker is allowed to have.
     */
    readonly tickSchedules: Effect.Effect<
      boolean,
      SqlError.SqlError,
      Database | Jobs
    >;
  }
>()('@studio/jobs/effect/JobWorker') {
  static readonly layer = (
    config: JobWorkerConfig,
  ): Layer.Layer<JobWorker, never, Database | Jobs> =>
    Layer.effect(JobWorker, make(config));
}

const make = Effect.fnUntraced(function* (config: JobWorkerConfig) {
  const schema = assertSchemaName(config.schema);
  const registry = new Map<JobQueueName, RegisteredHandler>();
  const fetching = MutableRef.make(true);
  const started = MutableRef.make(false);
  const maxInFlight = config.maxInFlight ?? DEFAULTS.maxInFlight;
  const inFlight = Semaphore.makeUnsafe(maxInFlight);

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

  /**
   * The claim. One statement, so two workers cannot take the same row:
   * `FOR UPDATE SKIP LOCKED` inside the subquery makes the loser pick the next
   * row rather than wait. `attempts` is counted here rather than after the
   * handler, so a process that dies mid-handler still leaves the attempt
   * spent — which is what bounds the expiry reaper.
   */
  const claim = Effect.fnUntraced(function* (
    queue: JobQueueName,
    now: DateTime.Utc,
  ) {
    const { expireInSeconds } = resolvedQueue(queue);
    const { sql } = yield* Transaction;
    const lockedUntil = DateTime.addDuration(
      now,
      Duration.seconds(expireInSeconds),
    );
    const rows = yield* sql<ClaimedRow>`
      UPDATE ${table(sql)}.jobs
         SET state = 'active',
             locked_until = ${DateTime.toDate(lockedUntil)},
             attempts = attempts + 1
       WHERE id = (
         SELECT id
           FROM ${table(sql)}.jobs
          WHERE queue = ${queue}
            AND state = 'created'
            AND run_at <= ${DateTime.toDate(now)}
          ORDER BY run_at, created_at
            FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
      RETURNING id, payload, attempts`;
    return rows[0];
  });

  const settleSuccess = Effect.fnUntraced(function* (
    jobId: JobId,
    outcome: JobOutcome,
    now: DateTime.Utc,
  ) {
    const { sql } = yield* Transaction;
    yield* sql`
      UPDATE ${table(sql)}.jobs
         SET state = 'completed',
             outcome = ${outcome},
             completed_at = ${DateTime.toDate(now)},
             locked_until = NULL,
             last_error = NULL
       WHERE id = ${jobId}`;
  });

  const settleDead = Effect.fnUntraced(function* (
    jobId: JobId,
    message: string,
    now: DateTime.Utc,
  ) {
    const { sql } = yield* Transaction;
    yield* sql`
      UPDATE ${table(sql)}.jobs
         SET state = 'dead',
             completed_at = ${DateTime.toDate(now)},
             locked_until = NULL,
             last_error = ${message}
       WHERE id = ${jobId}`;
  });

  /**
   * The retry ladder, or the end of it. `attempts` is the 1-based number of
   * the attempt that just failed, so the queue tries again while
   * `attempts <= retryLimit` — eight attempts for a limit of seven, which is
   * what `invitation-delivery` declares.
   */
  const settleFailure = Effect.fnUntraced(function* (
    queue: JobQueueName,
    jobId: JobId,
    attempts: number,
    message: string,
    now: DateTime.Utc,
  ) {
    const declaration = resolvedQueue(queue);
    const { sql } = yield* Transaction;

    if (attempts <= declaration.retryLimit) {
      const delay = yield* backoffSeconds(declaration, attempts);
      const runAt = DateTime.addDuration(now, Duration.seconds(delay));
      const keepUntil = DateTime.addDuration(
        runAt,
        Duration.seconds(declaration.retentionSeconds),
      );
      yield* sql`
        UPDATE ${table(sql)}.jobs
           SET state = 'created',
               run_at = ${DateTime.toDate(runAt)},
               keep_until = ${DateTime.toDate(keepUntil)},
               locked_until = NULL,
               last_error = ${message}
         WHERE id = ${jobId}`;
      const step: JobStep = {
        _tag: 'retrying',
        jobId,
        attempt: attempts,
        runAt,
      };
      return step;
    }

    yield* sql`
      UPDATE ${table(sql)}.jobs
         SET state = 'failed',
             completed_at = ${DateTime.toDate(now)},
             locked_until = NULL,
             last_error = ${message}
       WHERE id = ${jobId}`;

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

    // The copy #1307's manual re-send works from: the same payload, on the
    // dead-letter queue, naming the job that failed. Written inside the
    // settling transaction, so a job cannot be `failed` without it.
    const target = resolvedQueue(deadLetter);
    const keepUntil = DateTime.addDuration(
      now,
      Duration.seconds(target.retentionSeconds),
    );
    const copied = yield* sql<{ id: string }>`
      INSERT INTO ${table(sql)}.jobs
        (queue, payload, state, attempts, singleton_key,
         run_at, keep_until, created_at, dead_letter_of)
      SELECT ${deadLetter},
             payload,
             'created',
             0,
             ${target.policy === 'singleton' ? SINGLETON_QUEUE_KEY : null},
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

  const returnToQueue = Effect.fnUntraced(function* (jobId: JobId) {
    const { sql } = yield* Transaction;
    yield* sql`
      UPDATE ${table(sql)}.jobs
         SET state = 'created', attempts = attempts - 1, locked_until = NULL
       WHERE id = ${jobId}`;
  });

  const drainOnce = Effect.fn('JobWorker.drainOnce')(
    function* (queue: JobQueueName) {
      const now = yield* DateTime.now;
      const claimed = yield* withTransaction(claim(queue, now));
      if (claimed === undefined) {
        const idle: JobStep = { _tag: 'idle' };
        return idle;
      }

      const jobId: JobId = claimed.id;
      const declaration = resolvedQueue(queue);
      const handler = registry.get(queue);
      if (handler === undefined) {
        // Claimed by a worker that does not work this queue. Put it back rather
        // than fail it: another replica may have the handler.
        yield* withTransaction(returnToQueue(jobId));
        const idle: JobStep = { _tag: 'idle' };
        return idle;
      }

      // Outside the claim's transaction on purpose: a handler makes a network
      // call, and holding a transaction open across one is how a pool starves.
      const exit = yield* Effect.exit(
        handler({
          id: jobId,
          payload: claimed.payload,
          attempt: claimed.attempts,
          finalAttempt: claimed.attempts > declaration.retryLimit,
        }),
      );

      const settledAt = yield* DateTime.now;
      if (Exit.isSuccess(exit)) {
        yield* withTransaction(settleSuccess(jobId, exit.value, settledAt));
        yield* Effect.logDebug(
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
        yield* withTransaction(settleDead(jobId, describe(error), settledAt));
        yield* Effect.logError(
          `job ${queue} ${jobId} carries a payload this queue does not declare`,
        );
        const dead: JobStep = { _tag: 'dead', jobId };
        return dead;
      }

      const message = describe(error);
      const step = yield* withTransaction(
        settleFailure(queue, jobId, claimed.attempts, message, settledAt),
      );
      // §11, feasibility F8: the handler said nothing about retrying, so the
      // split lives here, at today's levels — an attempt that will run again is
      // a warning, one nothing will retry is an error.
      yield* step._tag === 'retrying'
        ? Effect.logWarning(
            `job ${queue} ${jobId} retrying after attempt ${claimed.attempts}: ${message}`,
          )
        : Effect.logError(
            `job ${queue} ${jobId} failed on attempt ${claimed.attempts}: ${message}`,
          );
      return step;
    },
    // The whole step holds a permit, not just the handler: a graceful stop that
    // let go the moment a handler returned would interrupt the fiber before it
    // had written the outcome, leaving a completed send recorded as `active`.
    (effect) => inFlight.withPermit(effect),
  );

  /**
   * An attempt whose lease ran out. The row goes back to `created` with its
   * attempt already spent — it was counted at claim time — so a handler that
   * hangs every time still walks the ladder rather than looping forever, and a
   * job whose ladder is done fails here instead of returning.
   */
  const reapExpired = Effect.fn('JobWorker.reapExpired')(function* () {
    const now = yield* DateTime.now;
    return yield* withTransaction(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        let reaped = 0;
        for (const declaration of resolvedQueues) {
          const rows = yield* sql<{ id: string }>`
            UPDATE ${table(sql)}.jobs
               SET state = CASE
                     WHEN attempts <= ${declaration.retryLimit}
                     THEN 'created' ELSE 'failed' END,
                   run_at = ${DateTime.toDate(now)},
                   completed_at = CASE
                     WHEN attempts <= ${declaration.retryLimit}
                     THEN NULL ELSE ${DateTime.toDate(now)} END,
                   locked_until = NULL,
                   last_error = 'the attempt did not finish before its lease expired'
             WHERE queue = ${declaration.name}
               AND state = 'active'
               AND locked_until <= ${DateTime.toDate(now)}
            RETURNING id`;
          reaped += rows.length;
        }
        return reaped;
      }),
    );
  });

  /**
   * pg-boss's `deletion` plan, predicate for predicate: a terminal row goes
   * `deleteAfterSeconds` after it ended (`0` keeps it forever), and a
   * `created` row nothing ever claimed goes when its `keep_until` passes —
   * which is what a queue's `retentionSeconds` means there.
   */
  const deleteExpired = Effect.fn('JobWorker.deleteExpired')(function* () {
    const now = yield* DateTime.now;
    return yield* withTransaction(
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
    const now = yield* DateTime.now;
    const encoded = yield* Effect.orDie(payloadCodec(queue).decode(payload));
    const nextRunAt = Cron.next(parsed.success, DateTime.toDate(now));
    yield* withTransaction(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        // An upsert, so every replica registers the same row and the last to
        // boot wins — which is how a changed cron expression reaches a running
        // deployment without anything unscheduling the old one.
        yield* sql`
          INSERT INTO ${table(sql)}.job_schedules
            (name, cron, queue, payload, next_run_at)
          VALUES (${name}, ${cron}, ${queue},
                  ${JSON.stringify(encoded)}::jsonb, ${nextRunAt})
          ON CONFLICT (name) DO UPDATE
            SET cron = excluded.cron,
                queue = excluded.queue,
                payload = excluded.payload,
                next_run_at = excluded.next_run_at`;
      }),
    );
  });

  /**
   * The schedule table is state, not configuration: removing a schedule from
   * the declarations only stops a new deployment from writing it, and the row
   * a previous release left keeps coming due on a queue nothing works. Read
   * then delete, as today's `dropUndeclaredSchedules` walks `getSchedules()`.
   */
  const dropUndeclaredSchedules = Effect.fnUntraced(function* (
    names: readonly string[],
  ) {
    return yield* withTransaction(
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
        return dropped as readonly string[];
      }),
    );
  });

  const tickSchedules = Effect.fn('JobWorker.tickSchedules')(function* () {
    const now = yield* DateTime.now;
    const jobs = yield* Jobs;
    return yield* withTransaction(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        const held = yield* sql<{ locked: boolean }>`
          SELECT pg_try_advisory_xact_lock(${CRON_LOCK_KEY}) AS locked`;
        // One replica ticks; the commit releases the lock.
        if (held[0]?.locked !== true) return false;

        const due = yield* sql<{
          name: string;
          cron: string;
          queue: JobQueueName;
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
          const nextRunAt = Cron.next(parsed.success, DateTime.toDate(now));
          yield* sql`
            UPDATE ${table(sql)}.job_schedules
               SET next_run_at = ${nextRunAt}
             WHERE name = ${row.name}`;
          // The row was written by `schedule`, which decoded it first.
          const payload = yield* Effect.orDie(
            payloadCodec(row.queue).decode(row.payload),
          );
          // The same `Jobs.enqueue` a command uses, inside this transaction:
          // the schedule's advance and the job it creates commit together, so
          // a tick cannot advance without enqueueing.
          const enqueued = yield* Effect.exit(jobs.enqueue(row.queue, payload));
          if (Exit.isFailure(enqueued)) {
            // A singleton queue whose last run has not finished. Ordinary:
            // the next tick picks it up.
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
    const depths = yield* withTransaction(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        // `count(*)::int`: rc.115 decodes a bare `count(*)` as a `bigint`.
        return yield* sql<QueueDepth>`
          SELECT queue, state, count(*)::int AS count
            FROM ${table(sql)}.jobs
           GROUP BY queue, state
           ORDER BY queue, state`;
      }),
    );
    MutableRef.set(started, true);
    return depths as readonly QueueDepth[];
  });

  const service = JobWorker.of({
    work,
    schedule,
    dropUndeclaredSchedules,
    ready: Effect.sync(() => MutableRef.get(started)),
    setFetching: (value) => Effect.sync(() => MutableRef.set(fetching, value)),
    queueDepths: queueDepths(),
    drainOnce,
    reapExpired: reapExpired(),
    deleteExpired: deleteExpired(),
    tickSchedules: tickSchedules(),
  });

  if (config.background === false) return service;

  yield* forkBackground(service, config, { fetching, inFlight, maxInFlight });
  return service;
});

/**
 * Every recurring fiber, forked into the layer's own scope, plus the graceful
 * stop. The stop is added *after* the forks so it runs *before* their
 * interruption: scope finalizers run in reverse. Stop claiming, give what is
 * in flight a bounded window, then let the scope interrupt whatever is left.
 */
const forkBackground = Effect.fnUntraced(function* (
  worker: JobWorker['Service'],
  config: JobWorkerConfig,
  state: {
    readonly fetching: MutableRef.MutableRef<boolean>;
    readonly inFlight: Semaphore.Semaphore;
    readonly maxInFlight: number;
  },
) {
  const pollQueue = (queue: JobQueueName) =>
    Effect.gen(function* () {
      if (!MutableRef.get(state.fetching)) return;
      // Drains a queue before sleeping again, so a burst is not spread across
      // one poll interval per job.
      let step = yield* worker.drainOnce(queue);
      while (step._tag !== 'idle') {
        if (!MutableRef.get(state.fetching)) return;
        step = yield* worker.drainOnce(queue);
      }
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError(`job poll for ${queue} failed: ${Cause.pretty(cause)}`),
      ),
      Effect.repeat(
        Schedule.spaced(config.pollInterval ?? DEFAULTS.pollInterval),
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

  for (const declaration of resolvedQueues) {
    yield* Effect.forkScoped(pollQueue(declaration.name));
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

/**
 * pg-boss's own formula (12.31.1 `dist/manager.js:1318-1329`), which is
 * jittered: a delay between half and all of `retryDelay * 2^attempt`, capped
 * by `retryDelayMax` where one is declared. The randomness comes from the
 * `Random` service rather than `Math.random`, so a test can pin it.
 */
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
