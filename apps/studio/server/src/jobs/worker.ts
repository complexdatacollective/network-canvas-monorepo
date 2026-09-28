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
  type JobPayload,
  payloadCodec,
  type ResolvedQueue,
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
// correction against `select now()` answers (clock.ts).

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
  /**
   * `true` builds the worker with fetching off, so nothing is claimed until
   * something calls `setFetching(true)`. The worker program sets it because
   * its fetching flag belongs to `JobMaintenanceGate`, whose first reading of
   * the deployment state is forked rather than awaited: a worker that started
   * fetching would claim from its first poll pass, before that reading could
   * say the deployment is in maintenance. Defaults to `false` — a worker with
   * no gate over it must start working on its own.
   */
  readonly startPaused?: boolean | undefined;
};

/**
 * How often the retention pass runs — a coupling rather than a taste. A
 * terminal row is deleted on this sweep and nowhere else, so a queue that
 * declares a `deleteAfterSeconds` shorter than this cadence does not get it:
 * `sign-in-email` asks for 60 seconds because its payload *is* the magic link.
 * Exported so `__tests__/declarations.test.ts` can hold the two together
 * rather than leaving the invariant to a comment in the declaration.
 */
export const RETENTION_INTERVAL = Duration.seconds(60);

const DEFAULTS = {
  pollInterval: Duration.seconds(2),
  reaperInterval: Duration.seconds(30),
  retentionInterval: RETENTION_INTERVAL,
  cronInterval: Duration.seconds(15),
  stopTimeout: Duration.seconds(25),
  maxInFlight: 8,
} as const;

/**
 * The cron tick's advisory lock, in Postgres's two-key form: this constant
 * class and `hashtext(<schema>)`, so two job schemas in one database (every
 * suite's scratch schema, and production's `studio_jobs` beside them on a
 * shared cluster) never contend for one another's tick. Taken with
 * `pg_try_advisory_xact_lock`, which the commit releases — a session lock held
 * by a replica that died mid-tick would otherwise stop every other replica
 * until the connection was reaped.
 */
const CRON_LOCK_CLASS = 402177;

/** What is written to `last_error`; a longer message is cut. */
const MAX_ERROR_LENGTH = 1_000;

/** What an expired lease writes to `last_error`, in place of a handler's. */
const LEASE_EXPIRED = 'the attempt did not finish before its lease expired';

/**
 * How many expired leases one transaction settles. The pass used to take every
 * expired row at once, which on a backlog is a single long transaction holding
 * a row lock on each of them and writing a dead-letter copy for some — the
 * kind of transaction that blocks a schema application and keeps a vacuum from
 * reclaiming anything older than it. The pass repeats until one transaction
 * settles fewer than this, so a backlog is still cleared in one tick, in
 * bounded pieces.
 */
export const EXPIRY_BATCH_SIZE = 200;

/**
 * The declarations by name. The reaper reads a queue name back out of a row
 * rather than off the types, and `resolvedQueue` refuses an undeclared one, so
 * the lookup answers rather than throws.
 */
const declaredQueues: ReadonlyMap<string, ResolvedQueue> = new Map(
  resolvedQueues.map((declaration) => [declaration.name, declaration]),
);

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

/** What the reaper needs to settle an expired lease the way a failure is. */
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
    /** True once the worker has read the queue tables at least once. */
    readonly ready: Effect.Effect<boolean>;
    /**
     * Whether the `LISTEN` this worker was configured to hold is held right
     * now. `None` where there is no listener to report on — a worker told
     * `listen: false`, or one that forks nothing at all — so a reader can tell
     * "no listener was wanted" from "the listener is down" (readiness.ts).
     */
    readonly listening: Effect.Effect<Option.Option<boolean>>;
    readonly setFetching: (fetching: boolean) => Effect.Effect<void>;
    readonly queueDepths: Effect.Effect<
      readonly QueueDepth[],
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    /**
     * One claim-run-settle step, run to completion. This is what the poll
     * fibers call and what the suites drive directly.
     */
    readonly drainOnce: (
      queue: JobQueueName,
    ) => Effect.Effect<JobStep, SqlError.SqlError, MaintenanceDatabase>;
    /** One expiry pass; forked on a timer when `background` is not false. */
    readonly reapExpired: Effect.Effect<
      number,
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    /** One retention pass; forked on a timer likewise. */
    readonly deleteExpired: Effect.Effect<
      number,
      SqlError.SqlError,
      MaintenanceDatabase
    >;
    /**
     * One cron pass. `false` means another replica held the advisory lock,
     * which is the only other outcome a second worker is allowed to have.
     */
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

/**
 * Putting a claimed row back, for a worker that claimed from a queue it
 * registers no handler for. Fenced exactly as the three settles are — `state`
 * and `attempts` both the claim's own — because this write moves the ladder
 * backwards: applied to a row a later attempt owns it would resurrect a job
 * another worker is still running, which fans out rather than merely
 * double-executing. Answers whether it wrote, like every other fenced write.
 *
 * At module level, with `backoffSeconds`, because the window it guards cannot
 * be opened from outside the worker: `drainOnce` claims, finds no handler, and
 * writes this in the next breath, with no seam a suite could suspend it at.
 * The fence is proven by running the statement itself against a row a later
 * attempt owns (`__tests__/settle.test.ts`).
 */
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
  /**
   * One latch per queue, open to start with so a worker that boots onto a
   * backlog drains it rather than waiting out a poll interval first. The poll
   * fiber waits on "the latch OR the interval", whichever comes first; the
   * listener opens the latch of the queue a `NOTIFY` names, and `setFetching`
   * opens every one when fetching resumes — a worker that booted paused has
   * already spent its open latch on a pass that claimed nothing.
   */
  const wake = new Map<JobQueueName, Latch.Latch>(
    resolvedQueues.map((declaration) => [
      declaration.name,
      Latch.makeUnsafe(true),
    ]),
  );
  /** Set when `forkListener` acquires its `LISTEN`, cleared when it loses it. */
  const listening = MutableRef.make(false);
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
    // `singleton` means one *active* job per queue. `jobs_singleton_active_idx`
    // is what enforces that; this guard is only an optimisation, sparing the
    // index a raise in the common case where the active job is already
    // committed and visible. Nothing depends on it — a claim that passes it
    // and loses to the index answers `idle` just the same, which is the path
    // `__tests__/concurrency.test.ts` proves end to end. pg-boss pairs the
    // same two things: `job_i2` and the `ignoreSingletons` filter its fetch
    // builds.
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

  /**
   * The fence every settle carries, and the reason each of them answers
   * whether it wrote anything.
   *
   * A settle belongs to the attempt that claimed the row, and the handler runs
   * outside the claim's transaction — so between the claim and the settle the
   * expiry reaper can have returned the row and another worker can have
   * claimed it. `state = 'active' AND attempts = <the claim's own>` is what
   * makes the stale attempt's write miss: without it a success marks a running
   * attempt completed, and a failure resurrects a row a second worker is still
   * running, which fans out rather than merely double-executing. pg-boss
   * guards its own terminal writes the same way (`completeJobsWithOutputs`'s
   * `AND j.state = 'active'`, `failJobsById`'s `state < 'completed'`).
   */
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

  /**
   * The retry ladder, or the end of it. `attempts` is the 1-based number of
   * the attempt that just failed, so the queue tries again while
   * `attempts <= retryLimit` — eight attempts for a limit of seven, which is
   * what `invitation-delivery` declares.
   *
   * Fenced like the two settles above, and `null` when the fence held nothing
   * back — the dead-letter copy is written only on the leg that actually
   * failed the row, because the copy belongs to the attempt that owns it.
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

  /**
   * A settle that wrote nothing. The row is no longer this attempt's: the
   * reaper returned it when the lease ran out and another worker has claimed
   * it since. There is nothing to do but say so — the attempt that owns the
   * row will settle it.
   */
  const leaseLost = (queue: JobQueueName, jobId: JobId, attempt: number) =>
    Effect.logWarning(
      `job ${queue} ${jobId} lost its lease before attempt ${attempt} could settle; the row belongs to a later attempt`,
    );

  const drainOnce = Effect.fn('JobWorker.drainOnce')(
    function* (queue: JobQueueName) {
      const idle: JobStep = { _tag: 'idle' };
      // Re-read here rather than only in the poll fiber: a fiber that passed
      // the fiber's own check and then waited for a permit would otherwise
      // claim a row *during* the stop window, spending an attempt on a job
      // the scope is about to interrupt. Inside the permit, so the finalizer's
      // `fetching = false` is already visible to anything the stop is waiting
      // behind.
      if (!MutableRef.get(fetching)) return idle;
      const now = yield* clock.now;
      // Two workers can pass a singleton queue's `NOT EXISTS` together; the
      // partial unique index is what stops the second, and being stopped by it
      // is "nothing to claim" rather than an error (errors.ts).
      const claimedOrRaced = yield* Effect.exit(
        MaintenanceScope.open(claim(queue, now)),
      );
      if (
        Exit.isFailure(claimedOrRaced) &&
        !isUniqueViolationCause(claimedOrRaced.cause)
      ) {
        return yield* Effect.failCause(claimedOrRaced.cause);
      }
      // The claim query answered — from the row it returned or from the index
      // that refused it — so this worker has read its own tables, which is all
      // `ready` claims. Set here as well as in `queueDepths` so readiness does
      // not depend on which optional layers a program happens to mount
      // (readiness.ts).
      MutableRef.set(started, true);
      if (Exit.isFailure(claimedOrRaced)) return idle;
      const claimed = claimedOrRaced.value;
      if (claimed === undefined) return idle;

      const jobId: JobId = claimed.id;
      const handler = registry.get(queue);
      if (handler === undefined) {
        // Claimed by a worker that does not work this queue. Put it back rather
        // than fail it: another replica may have the handler.
        const returned = yield* MaintenanceScope.open(
          returnToQueue(schema, jobId, claimed.attempts),
        );
        if (!returned) yield* leaseLost(queue, jobId, claimed.attempts);
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
        const fenced = yield* MaintenanceScope.open(
          settleSuccess(jobId, claimed.attempts, exit.value, settledAt),
        );
        if (!fenced) {
          yield* leaseLost(queue, jobId, claimed.attempts);
          return idle;
        }
        // `uncertain` is the one outcome that wants a human: a side effect
        // left the process and its record could not be written, so nothing
        // will retry it and the column is the only other trace. At debug it
        // was dropped outright — `LoggerLive` sets no minimum, so Effect's
        // default `Info` swallowed it. `completed` and `suppressed` stay at
        // debug: they are the queue working.
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
   * An attempt whose lease ran out, settled exactly as a handler failure is.
   *
   * It goes through `settleFailure` rather than a statement of its own, which
   * is what buys the three things an expiry used to skip: the retry ladder's
   * backoff (a handler that hangs every time now backs off instead of being
   * retried at the reaper's cadence), the dead-letter copy on the attempt the
   * queue will not retry (without it #1307's manual re-send has nothing to
   * work from), and the same frozen policy every other settle reads. pg-boss's
   * own expiry supervisor is not a separate path either — `failJobsByTimeout`
   * runs the same `failJobsBody` CTE an ordinary failure does.
   *
   * The attempt was already counted at claim time, so a handler that hangs on
   * every attempt still walks the ladder to its end rather than looping.
   *
   * One transaction per batch of `EXPIRY_BATCH_SIZE`, not per row: the rows are
   * taken `FOR UPDATE SKIP LOCKED` so a second reaper skips what this one
   * holds, and that lock only exists inside the transaction that took it —
   * settling per row would need a fresh select and a fresh lock for each. A
   * tick keeps opening transactions until one settles fewer rows than the
   * batch, so a backlog is still cleared in a tick without any one transaction
   * being unbounded.
   *
   * The loop reads the count *settled*, not the count seen, and that is what
   * keeps it finite: a row this build cannot settle — one on a queue no
   * declaration names — is logged and left where it is, and would otherwise be
   * re-read at the head of every pass forever. A pass that settles nothing
   * ends the tick and the next one makes whatever progress it can behind it.
   * The cutoff instant is read once, before the first pass, so a lease
   * expiring while the reaper runs waits for the next tick rather than
   * extending this one.
   */
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
          // A row on a queue this build does not declare. Nothing here can
          // settle it — the ladder it would walk does not exist — so it is
          // named rather than guessed at.
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

  /**
   * pg-boss's `deletion` plan, predicate for predicate: a terminal row goes
   * `deleteAfterSeconds` after it ended (`0` keeps it forever), and a
   * `created` row nothing ever claimed goes when its `keep_until` passes —
   * which is what a queue's `retentionSeconds` means there.
   */
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
        // An upsert, so every replica registers the same row and the last to
        // boot wins — which is how a changed cron expression reaches a running
        // deployment without anything unscheduling the old one.
        //
        // `next_run_at` is the one column a boot leaves alone unless the cron
        // expression itself changed: recomputing it unconditionally moves an
        // occurrence that has already come due forward by up to a whole
        // interval, so a replica restarting in the window between a schedule
        // falling due and the cron fiber's next tick would skip it. A changed
        // expression is the only case where the stored time means something
        // the deployment no longer asked for.
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

  /**
   * The schedule table is state, not configuration: removing a schedule from
   * the declarations only stops a new deployment from writing it, and the row
   * a previous release left keeps coming due on a queue nothing works. Read
   * then delete, as today's `dropUndeclaredSchedules` walks `getSchedules()`.
   */
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
    const depths: readonly QueueDepth[] = yield* MaintenanceScope.open(
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
    return depths;
  });

  // Whether this worker holds a listener at all, decided by the config rather
  // than by the flag: a worker that forks nothing, or one told not to listen,
  // has no listener to be up or down, and reporting one as down would make
  // every suite's readiness probe degraded for a listener nobody wanted.
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
      // Closed *before* the drain, not after: a job that commits while this
      // fiber is draining must leave the latch open, or its notification would
      // be swallowed by a close that ran afterwards and the job would wait for
      // the poll interval after all.
      yield* latch.close;
      if (!MutableRef.get(state.fetching)) {
        // A worker that booted paused has claimed nothing, and a first
        // answered claim is what makes it `ready`. It still has to prove it
        // can read its tables, or readiness would report a worker booted into
        // maintenance as unable to reach its queue until the window ended —
        // or lean on `JobQueueMetrics.layer` to say otherwise (readiness.ts).
        // Once, until it answers: a worker paused after it was ready reads
        // nothing.
        if (!(yield* worker.ready)) yield* worker.queueDepths;
        return;
      }
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

  if (config.listen !== false) {
    yield* forkListener(schema, wake, state.listening);
  }

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

/** Where the listener's reconnection backoff starts. */
const LISTEN_RETRY_BASE = Duration.millis(200);

/**
 * And where it stops — deliberately far above the poll interval, which is what
 * it used to be capped at. A listener that cannot be re-acquired at all (a
 * pooler that refuses a long-lived reservation, a role that lost `LISTEN`)
 * retried every two seconds for the life of the process, writing a
 * pretty-printed cause each time: some forty thousand lines a day. Thirty
 * seconds costs a couple of thousand instead, and is no slower for an ordinary
 * reconnection, which takes the first step or two of the ladder.
 */
const LISTEN_RETRY_CAP = Duration.seconds(30);

/**
 * The ladder, off the number of losses since the last successful acquire
 * rather than off the schedule's own recurrence count — so it resets when the
 * listener comes back, and a process that loses its listener once a month does
 * not eventually reconnect at the cap.
 */
const listenRetryDelay = (consecutiveLosses: number): Duration.Duration =>
  Duration.min(
    LISTEN_RETRY_CAP,
    Duration.times(
      LISTEN_RETRY_BASE,
      // Clamped at both ends: the first loss waits the base, and 2^8 already
      // overshoots the cap, so nothing above it can change the answer.
      2 ** Math.min(8, Math.max(0, consecutiveLosses - 1)),
    ),
  );

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
 * `sql.listen` reserves a pooled connection for as long as *its own* scope is
 * open (`PgClient.make` wires `listenAcquirer` to `pool.reserve`), which is why
 * the pool is sized with one connection to spare rather than exactly.
 *
 * The acquire and the take loop are one unit, retried forever on the backoff
 * above, because a lost reserved connection is not an error the take loop can
 * see coming: `PgConnection.fatal` fails every listen queue with
 * `Cause.interrupt()`, so the take simply ends. Without the retry the worker is
 * deaf for the rest of the process's life with no log line and no metric, and
 * the two queues that declare `notify` — the two where a person is waiting —
 * quietly fall back to the poll interval. The scope is per attempt rather than
 * the layer's, so a reconnection releases the dead reservation before it takes
 * a new one. External interruption (the layer's scope closing) skips the
 * failure continuation entirely, so a stop ends the loop rather than
 * reconnecting through it.
 *
 * What it is like to read: the first loss of a run is a warning carrying the
 * cause, every consecutive loss after it is a debug line, and the acquire that
 * ends the run is an info line naming how many there were. So a listener that
 * is genuinely dead says so once and then goes quiet, and `listening` — which
 * `jobsCheck` reads as `degraded` — is what an operator watches instead of the
 * log volume.
 */
const forkListener = Effect.fnUntraced(function* (
  schema: string,
  // Keyed by string rather than `JobQueueName`: the payload is whatever the
  // trigger put on the channel, and a name this build does not declare simply
  // finds no latch.
  wake: ReadonlyMap<string, Latch.Latch>,
  listening: MutableRef.MutableRef<boolean>,
) {
  const { sql } = yield* MaintenanceDatabase;
  const channel = jobNotifyChannel(schema);
  // Losses since the last acquire. It decides the backoff step and the level a
  // loss is logged at, so the two cannot disagree about what "still down"
  // means.
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
        // A queue this worker does not poll — another replica's, or one a
        // later release added. Its own listener will have had the same message.
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

  // `Schedule.forever` with the delay read off `losses`, rather than
  // `Schedule.exponential`, whose own recurrence count never resets: a process
  // that loses its listener now and then would otherwise end its life
  // reconnecting at the cap however healthy the run in between was.
  const backoff = Schedule.modifyDelay(Schedule.forever, () =>
    Effect.succeed(listenRetryDelay(MutableRef.get(losses))),
  );

  yield* Effect.forkScoped(
    session.pipe(Effect.catchCause(lost), Effect.repeat(backoff)),
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
