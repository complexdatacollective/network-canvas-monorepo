import { Context, DateTime, Effect, Layer, Schema } from 'effect';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { Transaction } from './database.ts';
import {
  type JobPayload,
  payloadCodec,
  resolvedQueue,
  SINGLETON_QUEUE_KEY,
} from './queues.ts';
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
 * The queue would not take the job. Today that is one thing: a singleton
 * collision — a job on this queue and key is already `created` or `active`.
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
   * Makes this job a singleton under its own key. A `singleton` queue gets
   * `SINGLETON_QUEUE_KEY` when the caller names none, so the queue-level
   * policy and the per-call option arbitrate through one index.
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
  static readonly layer = (config: JobsConfig): Layer.Layer<Jobs> =>
    Layer.succeed(Jobs)(Jobs.of({ enqueue: makeEnqueue(config) }));

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

const makeEnqueue = (config: JobsConfig) => {
  const schema = assertSchemaName(config.schema);

  return Effect.fnUntraced(function* <Queue extends JobQueueName>(
    queue: Queue,
    payload: JobPayload<Queue>,
    options?: EnqueueOptions,
  ) {
    const declaration = resolvedQueue(queue);
    const encoded = yield* decodePayload(queue, payload);
    const { sql } = yield* Transaction;
    const now = yield* DateTime.now;
    const runAt = options?.startAfter ?? now;
    const singletonKey =
      options?.singletonKey ??
      (declaration.policy === 'singleton' ? SINGLETON_QUEUE_KEY : null);
    const keepUntil = DateTime.addDuration(
      runAt,
      `${declaration.retentionSeconds} seconds`,
    );

    // A failure here is not the caller's to recover: the transaction is
    // already aborted, so anything it might do instead would fail too.
    const rows = yield* Effect.orDie(
      sql<{ id: string }>`
        INSERT INTO ${sql(schema)}.jobs
          (queue, payload, state, attempts, singleton_key,
           run_at, keep_until, created_at)
        VALUES (
          ${queue},
          ${JSON.stringify(encoded)}::jsonb,
          'created',
          0,
          ${singletonKey},
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
