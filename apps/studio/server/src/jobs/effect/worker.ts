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
import type { SqlClient, SqlError } from 'effect/unstable/sql';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { JobClock, type JobClockShape } from './clock.ts';
import { Database, Transaction, withTransaction } from './database.ts';
import {
  causeError,
  deepestMessage,
  isUniqueViolationCause,
} from './errors.ts';
import { Jobs, type JobId } from './jobs.ts';
import {
  type JobPayload,
  payloadCodec,
  resolvedQueue,
  resolvedQueues,
} from './queues.ts';
import { assertSchemaName, type JobState, jobNotifyChannel } from './schema.ts';

// The `JobWorker` row of #1927 §4, on the native queue: it claims, runs,
// settles, reaps, deletes and ticks the cron, and never binds a port.
//
// Everything that asks the time asks `JobClock` and passes the answer to
// Postgres as a parameter. pg-boss asks the database instead — `now()` is in
// every one of its plans — and that is the biggest structural difference
// between the two. An app-clock queue is `TestClock`-drivable end to end, which
// is what lets every case below run in virtual time against a real Postgres; it
// is also skew-sensitive across replicas, which is what `JobClock.layer`'s
// correction against `select now()` answers (clock.ts). See the spike report.

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
  /**
   * How long an idle queue waits before looking again when nothing has woken
   * it. With the schema's `NOTIFY` trigger in place this is the safety net
   * rather than the mechanism — a job announces itself on commit and the poll
   * fiber is released immediately — so it is two seconds rather than pg-boss's
   * floor of half a second: it now only has to cover a lost notification (a
   * dropped listener connection, a row made `created` while the listener was
   * reconnecting), not the ordinary case.
   */
  readonly pollInterval?: Duration.Input | undefined;
  readonly reaperInterval?: Duration.Input | undefined;
  readonly retentionInterval?: Duration.Input | undefined;
  readonly cronInterval?: Duration.Input | undefined;
  /** How long a graceful stop waits for in-flight handlers. */
  readonly stopTimeout?: Duration.Input | undefined;
  /** Handlers in flight across every worked queue. */
  readonly maxInFlight?: number | undefined;
  /**
   * `false` leaves the schema's `NOTIFY` channel unlistened, so a queue is
   * drained on its poll interval alone. Only a suite wants that — it is the
   * negative half of the notify oracle — and it costs nothing in production,
   * where the listener holds one pooled connection for the process's life.
   */
  readonly listen?: boolean | undefined;
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

/**
 * The row's frozen columns in the shape `backoffSeconds` reads. The formula is
 * shared with the declaration-shaped path the suites call it on directly, so
 * the two cannot drift.
 */
const frozenLadder = (frozen: FrozenPolicy) => ({
  retryDelay: frozen.retry_delay,
  retryBackoff: frozen.retry_backoff,
  retryDelayMax: frozen.retry_delay_max,
});

/**
 * The retry policy as the *row* carries it, which is what settles a job.
 * Frozen at enqueue, so a deployment that changes a queue's declaration
 * changes nothing about a job already in flight — pg-boss freezes the same
 * five values onto its own row for the same reason.
 */
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
  // Read once, here: every timestamp the worker writes comes from the same
  // clock the enqueue used, corrected for skew against the database or not as
  // the wiring decided (clock.ts).
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
    const declaration = resolvedQueue(queue);
    const { sql } = yield* Transaction;
    const at = DateTime.toDate(now);
    // `singleton` means one *active* job per queue. The index enforces it; this
    // keeps the claim from trying, which is what turns "the second job errors"
    // into "the second job waits". pg-boss does both in the same two places:
    // `job_i2` and the `ignoreSingletons` filter its fetch builds.
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
    //
    // The copy freezes the *target* queue's policy at copy time, not the
    // failed job's: it is a new job on a different queue, and pg-boss's own
    // `createJob` reads the target queue's cached options the same way.
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

  const returnToQueue = Effect.fnUntraced(function* (jobId: JobId) {
    const { sql } = yield* Transaction;
    yield* sql`
      UPDATE ${table(sql)}.jobs
         SET state = 'created', attempts = attempts - 1, locked_until = NULL
       WHERE id = ${jobId}`;
  });

  const drainOnce = Effect.fn('JobWorker.drainOnce')(
    function* (queue: JobQueueName) {
      const now = yield* clock.now;
      const idle: JobStep = { _tag: 'idle' };
      // Two workers can pass a singleton queue's `NOT EXISTS` together; the
      // partial unique index is what stops the second, and being stopped by it
      // is "nothing to claim" rather than an error (errors.ts).
      const claimedOrRaced = yield* Effect.exit(
        withTransaction(claim(queue, now)),
      );
      if (Exit.isFailure(claimedOrRaced)) {
        if (!isUniqueViolationCause(claimedOrRaced.cause)) {
          return yield* Effect.failCause(claimedOrRaced.cause);
        }
        return idle;
      }
      const claimed = claimedOrRaced.value;
      if (claimed === undefined) return idle;

      const jobId: JobId = claimed.id;
      const handler = registry.get(queue);
      if (handler === undefined) {
        // Claimed by a worker that does not work this queue. Put it back rather
        // than fail it: another replica may have the handler.
        yield* withTransaction(returnToQueue(jobId));
        return idle;
      }

      // Outside the claim's transaction on purpose: a handler makes a network
      // call, and holding a transaction open across one is how a pool starves.
      const exit = yield* Effect.exit(
        handler({
          id: jobId,
          payload: claimed.payload,
          attempt: claimed.attempts,
          // Off the row's frozen limit, so a handler's last-attempt branch
          // agrees with the settling that follows it.
          finalAttempt: claimed.attempts > claimed.retry_limit,
        }),
      );

      const settledAt = yield* clock.now;
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
        settleFailure(
          queue,
          jobId,
          claimed.attempts,
          claimed,
          message,
          settledAt,
        ),
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
    const now = yield* clock.now;
    const at = DateTime.toDate(now);
    return yield* withTransaction(
      Effect.gen(function* () {
        const { sql } = yield* Transaction;
        // One statement across every queue, because the ladder it compares
        // against is on the row: a per-queue loop only existed to reach the
        // declaration's `retryLimit`, and reading that here would be exactly
        // the redeploy hazard freezing the policy removes.
        const rows = yield* sql<{ id: string }>`
          UPDATE ${table(sql)}.jobs
             SET state = CASE
                   WHEN attempts <= retry_limit THEN 'created' ELSE 'failed' END,
                 run_at = ${at},
                 completed_at = CASE
                   WHEN attempts <= retry_limit
                   THEN NULL ELSE ${at}::timestamptz END,
                 locked_until = NULL,
                 last_error = 'the attempt did not finish before its lease expired'
           WHERE state = 'active'
             AND locked_until <= ${at}
          RETURNING id`;
        return rows.length;
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
    const now = yield* clock.now;
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
    const now = yield* clock.now;
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
    const now = yield* clock.now;
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
          //
          // Under the schedule's own name as a singleton key, which bounds a
          // schedule's backlog at one un-finished occurrence. This is the one
          // place the queue deliberately does not match pg-boss: pg-boss
          // throttles the *relay* (its `__pgboss__send-it` job carries
          // `singletonSeconds: 60`, `timekeeper.js:387`) and then calls
          // `manager.send` on the target queue, where a `singleton` policy
          // constrains only the `active` row — so a sweep that runs longer than
          // its cadence leaves pg-boss a `created` row per occurrence, growing
          // without bound while the active one runs. Studio's two scheduled
          // queues are both idempotent whole-world sweeps (`protocol-store-gc`,
          // `denied-attempts-summary`): a queued backlog of them is pure waste,
          // and a missed occurrence is picked up by the next one.
          const enqueued = yield* Effect.exit(
            jobs.enqueue(row.queue, payload, { singletonKey: row.name }),
          );
          if (Exit.isFailure(enqueued)) {
            // An occurrence of this schedule is still queued or running.
            // Ordinary: the next tick picks it up.
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

  yield* forkBackground(service, config, schema, {
    fetching,
    inFlight,
    maxInFlight,
    registry,
  });
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
  schema: string,
  state: {
    readonly fetching: MutableRef.MutableRef<boolean>;
    readonly inFlight: Semaphore.Semaphore;
    readonly maxInFlight: number;
    readonly registry: ReadonlyMap<JobQueueName, unknown>;
  },
) {
  /**
   * One latch per queue, open to start with so a worker that boots onto a
   * backlog drains it rather than waiting out a poll interval first. The poll
   * fiber waits on "the latch OR the interval", whichever comes first; the
   * listener below opens the latch of the queue a `NOTIFY` names.
   */
  const wake = new Map<JobQueueName, Latch.Latch>(
    resolvedQueues.map((declaration) => [
      declaration.name,
      Latch.makeUnsafe(true),
    ]),
  );

  const pollQueue = (queue: JobQueueName, latch: Latch.Latch) =>
    Effect.gen(function* () {
      // Closed *before* the drain, not after: a job that commits while this
      // fiber is draining must leave the latch open, or its notification would
      // be swallowed by a close that ran afterwards and the job would wait for
      // the poll interval after all.
      yield* latch.close;
      if (!MutableRef.get(state.fetching)) return;
      // A queue this replica registers no handler for is not claimed from at
      // all — as pg-boss only polls what `work()` named. Claiming it would put
      // the row straight back (`drainOnce`'s no-handler branch), and putting it
      // back makes it `created` again, which the schema's trigger announces,
      // which wakes this fiber, which claims it again: a livelock rather than
      // a wasted round trip. Re-read each pass, because `work()` is called
      // after the layer has built.
      if (!state.registry.has(queue)) return;
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
      // The wait is the loop's first act, and the latch starts open, so the
      // first pass drains immediately.
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

  if (config.listen !== false) yield* forkListener(schema, wake);

  // Over the map rather than the declarations, so every latch has exactly one
  // poll fiber and no lookup can miss.
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

/**
 * The one `LISTEN` the worker holds, and the fiber that turns what arrives on
 * it into a wake-up for the right queue.
 *
 * The channel is the schema's own name and the payload is the queue's, both
 * written by the `notify_job` trigger — so *any* writer wakes this worker: an
 * enqueue through `Jobs`, the expiry reaper putting a job back, a future
 * node-postgres path, an operator running an UPDATE by hand. Nothing in
 * application code has to remember to announce a job.
 *
 * `sql.listen` reserves a pooled connection for as long as the scope is open
 * (`PgClient.make` wires `listenAcquirer` to `pool.reserve`), which is why the
 * pool is sized with one connection to spare rather than exactly.
 */
const forkListener = Effect.fnUntraced(function* (
  schema: string,
  // Keyed by string rather than `JobQueueName`: the payload is whatever the
  // trigger put on the channel, and a name this build does not declare simply
  // finds no latch.
  wake: ReadonlyMap<string, Latch.Latch>,
) {
  const { sql } = yield* Database;
  const channel = jobNotifyChannel(schema);
  const notifications = yield* Effect.orDie(sql.listen(channel));
  yield* Effect.forkScoped(
    Effect.forever(
      Effect.flatMap(Queue.take(notifications), (notification) => {
        const latch = wake.get(notification.payload);
        // A queue this worker does not poll — another replica's, or one a
        // later release added. Its own listener will have had the same message.
        return latch === undefined ? Effect.void : latch.open;
      }),
    ),
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
