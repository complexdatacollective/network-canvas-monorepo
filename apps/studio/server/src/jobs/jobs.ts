import { Context, DateTime, Effect, Layer, Schema } from 'effect';

import type { JobPayload, JobQueueName } from '@codaco/studio-sync/jobs';

import { Transaction } from '../db/tenant.ts';
import { JobClock, type JobClockShape } from './clock.ts';
import { insertJobStatement } from './insert.ts';
import { payloadCodec } from './queues.ts';
import { assertSchemaName } from './schema.ts';

// The Effect half of creating a job (#1927 §4, the `Jobs` row). One statement
// on the transaction's own connection, which is the whole of the transaction
// guarantee: `enqueue` requires `Transaction`, nothing but `TenantScope.open`
// / `MaintenanceScope.open` (src/db/tenant.ts) provides it, and a statement
// issued inside a transaction runs on that
// transaction's connection because `SqlClient` routes by the fiber's
// `TransactionConnection` service (SqlClient.ts `makeWithTransaction`). There
// is no second connection an enqueue could reach for, so a domain row and its
// job commit together or not at all.
//
// The statement itself is `insertJobStatement` (insert.ts), in a module of its
// own because the source policy (`__tests__/source-policy.test.ts`) pins which
// modules may create a job, and one module holding the statement is what makes
// that pin meaningful. `enqueue` below is its one caller since the web
// process's node-postgres twin went.

/** The `jobs.id` a successful enqueue reads back. */
export type JobId = string;

/**
 * The queue would not take the job. Today that is one thing: a collision on a
 * per-enqueue `singletonKey` — a job on this queue and key is already
 * `created` or `active`. A queue's `singleton` *policy* never refuses an
 * enqueue; it only keeps the second job `created` until the first stops being
 * `active`.
 *
 * Decided: a collision is a typed failure, not a silent no-op.
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
>()('@studio/jobs/Jobs') {
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
>()('@studio/jobs/RecordedJobs') {}

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
    const encoded = yield* decodePayload(queue, payload);
    const { sql } = yield* Transaction;
    // The corrected clock rather than the database's `now()`: every other
    // instant this queue compares against — a claim's `run_at <= now`, the
    // reaper's `locked_until`, a `TestClock`-driven suite — comes from here.
    const now = yield* clock.now;
    const statement = insertJobStatement({
      schema,
      queue,
      payload: encoded,
      singletonKey: options?.singletonKey ?? null,
      now: DateTime.toDate(now),
      startAfter:
        options?.startAfter === undefined
          ? null
          : DateTime.toDate(options.startAfter),
    });

    // A failure here is not the caller's to recover: the transaction is
    // already aborted, so anything it might do instead would fail too.
    const rows = yield* Effect.orDie(
      sql.unsafe<{ id: string }>(statement.text, statement.values),
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
