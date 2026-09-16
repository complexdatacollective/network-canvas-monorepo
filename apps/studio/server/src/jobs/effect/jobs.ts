import { Context, DateTime, Effect, Layer, Schema } from 'effect';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { JobClock, type JobClockShape } from './clock.ts';
import { Transaction } from './database.ts';
import { type JobPayload, payloadCodec, resolvedQueue } from './queues.ts';
import { assertSchemaName } from './schema.ts';

// The only module that creates a job (#1927 §4, the `Jobs` row). One statement
// on the transaction's own connection, which is the whole of the transaction
// guarantee: `enqueue` requires `Transaction`, nothing but `withTransaction`
// provides it, and a statement issued inside a transaction runs on that
// transaction's connection because `SqlClient` routes by the fiber's
// `TransactionConnection` service (SqlClient.ts `makeWithTransaction`). There
// is no second connection an enqueue could reach for, so a domain row and its
// job commit together or not at all.

/** The `jobs.id` a successful enqueue reads back. */
export type JobId = string;

/**
 * The queue would not take the job. Today that is one thing: a collision on a
 * per-enqueue `singletonKey` — a job on this queue and key is already
 * `created` or `active`. A queue's `singleton` *policy* never refuses an
 * enqueue; it only keeps the second job `created` until the first stops being
 * `active`.
 *
 * Decided for the spike: a collision is a typed failure, not a silent no-op.
 * The insert is `ON CONFLICT DO NOTHING` rather than letting the unique index
 * raise `23505`, because a unique violation aborts the caller's transaction —
 * which would turn "the recurring job is already queued", an ordinary and
 * expected outcome, into the loss of whatever domain work the caller was
 * committing alongside it. `ON CONFLICT DO NOTHING` leaves the transaction
 * healthy and returns no row, which is what this error reports.
 */
export class JobRefused extends Schema.TaggedError<JobRefused>()('JobRefused', {
  queue: Schema.String,
  reason: Schema.String,
}) {}

export type EnqueueOptions = {
  /** Not before this instant; defaults to now. */
  readonly startAfter?: DateTime.Utc | undefined;
  /**
   * Makes this job a singleton under its own key: one job per (queue, key)
   * among `created` and `active`, and a second is refused.
   *
   * This is pg-boss's per-send `singletonKey` and has nothing to do with the
   * queue-level `singleton` *policy*, which limits how many jobs may be
   * `active` at once and lets the rest wait. A caller wanting "do not queue a
   * second one of these at all" names a key; a queue wanting "never run two of
   * these at once" declares the policy.
   */
  readonly singletonKey?: string | undefined;
};

export type JobsConfig = {
  readonly schema: string;
};

export class Jobs extends Context.Service<
  Jobs,
  {
    readonly enqueue: <Queue extends JobQueueName>(
      queue: Queue,
      payload: JobPayload<Queue>,
      options?: EnqueueOptions,
    ) => Effect.Effect<JobId, JobRefused, Transaction>;
  }
>()('@studio/jobs/effect/Jobs') {
  /**
   * The clock is read once, here, rather than inside `enqueue`: reading it per
   * call would put `JobClock` into `enqueue`'s requirements, and `Transaction`
   * being the whole of that set is what makes "this job commits with the
   * caller's work" a type-level guarantee rather than a convention.
   */
  static readonly layer = (config: JobsConfig): Layer.Layer<Jobs> =>
    Layer.effect(
      Jobs,
      Effect.map(JobClock, (clock) =>
        Jobs.of({ enqueue: makeEnqueue(config, clock) }),
      ),
    );

  /**
   * What the domain suites use instead of a database: the same signature and
   * the same payload validation, recording rather than inserting. Still
   * requires `Transaction`, so a command that enqueues outside one fails to
   * typecheck under the recording layer exactly as it does under the live one.
   */
  static readonly layerRecording: Layer.Layer<Jobs | RecordedJobs> =
    Layer.effectContext(
      Effect.sync(() => {
        const recorded: RecordedJob[] = [];
        let next = 0;
        const enqueue = Effect.fnUntraced(function* <
          Queue extends JobQueueName,
        >(queue: Queue, payload: JobPayload<Queue>, options?: EnqueueOptions) {
          const encoded = yield* decodePayload(queue, payload);
          // Requires the service without using it: a recorded enqueue must be
          // no easier to reach than a real one.
          yield* Transaction;
          next += 1;
          const id: JobId = `recorded-${next}`;
          recorded.push({
            id,
            queue,
            payload: encoded,
            startAfter: options?.startAfter,
            singletonKey: options?.singletonKey,
          });
          return id;
        });
        return Context.make(Jobs, Jobs.of({ enqueue })).pipe(
          Context.add(
            RecordedJobs,
            RecordedJobs.of({
              recorded,
              clear: Effect.sync(() => {
                recorded.length = 0;
              }),
            }),
          ),
        );
      }),
    );
}

export type RecordedJob = {
  readonly id: JobId;
  readonly queue: JobQueueName;
  readonly payload: unknown;
  readonly startAfter: DateTime.Utc | undefined;
  readonly singletonKey: string | undefined;
};

export class RecordedJobs extends Context.Service<
  RecordedJobs,
  {
    readonly recorded: RecordedJob[];
    readonly clear: Effect.Effect<void>;
  }
>()('@studio/jobs/effect/RecordedJobs') {}

/**
 * Parsed rather than merely checked, and with excess properties refused: what
 * is stored is what the schema admits, so a handler reading it back cannot
 * find a field the payload policy forbids. A payload that does not decode is
 * a defect — every caller is inside a transaction, and there is nothing a
 * command can usefully do about a payload it built itself and got wrong.
 */
const decodePayload = <Queue extends JobQueueName>(
  queue: Queue,
  payload: JobPayload<Queue>,
): Effect.Effect<JobPayload<Queue>> =>
  Effect.orDie(payloadCodec(queue).decode(payload));

const makeEnqueue = (config: JobsConfig, clock: JobClockShape) => {
  const schema = assertSchemaName(config.schema);

  return Effect.fnUntraced(function* <Queue extends JobQueueName>(
    queue: Queue,
    payload: JobPayload<Queue>,
    options?: EnqueueOptions,
  ) {
    const declaration = resolvedQueue(queue);
    const encoded = yield* decodePayload(queue, payload);
    const { sql } = yield* Transaction;
    const now = yield* clock.now;
    const runAt = options?.startAfter ?? now;
    const singletonKey = options?.singletonKey ?? null;
    const keepUntil = DateTime.addDuration(
      runAt,
      `${declaration.retentionSeconds} seconds`,
    );

    // A failure here is not the caller's to recover: the transaction is
    // already aborted, so anything it might do instead would fail too.
    const rows = yield* Effect.orDie(
      sql<{ id: string }>`
        INSERT INTO ${sql(schema)}.jobs
          (queue, payload, state, policy, attempts, singleton_key,
           retry_limit, retry_delay, retry_backoff, retry_delay_max,
           expire_in_seconds, run_at, keep_until, created_at)
        VALUES (
          ${queue},
          ${JSON.stringify(encoded)}::jsonb,
          'created',
          ${declaration.policy},
          0,
          ${singletonKey},
          ${declaration.retryLimit},
          ${declaration.retryDelay},
          ${declaration.retryBackoff},
          ${declaration.retryDelayMax},
          ${declaration.expireInSeconds},
          ${DateTime.toDate(runAt)},
          ${DateTime.toDate(keepUntil)},
          ${DateTime.toDate(now)}
        )
        ON CONFLICT DO NOTHING
        RETURNING id`,
    );

    const inserted = rows[0];
    if (inserted === undefined) {
      return yield* new JobRefused({
        queue,
        reason: 'a job is already queued on this queue and singleton key',
      });
    }
    return inserted.id;
  });
};
