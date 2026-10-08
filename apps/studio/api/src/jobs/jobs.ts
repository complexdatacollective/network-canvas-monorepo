import { Context, DateTime, Effect, Layer, Option, Schema } from 'effect';

import {
  type EncodedJobPayload,
  JOB_PAYLOAD_PARSE_OPTIONS,
  type JobCorrelation,
  JobCorrelationSchema,
  type JobPayload,
  type JobQueueName,
} from '@codaco/studio-sync/jobs';

import { Transaction } from '../db/tenant.ts';
import { JobClock, type JobClockShape } from './clock.ts';
import { insertJobStatement } from './insert.ts';
import { payloadCodec } from './queues.ts';
import { assertSchemaName } from './schema.ts';

export type JobId = string;

/** `ON CONFLICT DO NOTHING` rather than raising `23505`, which would abort the caller's transaction. */
export class JobRefused extends Schema.TaggedError<JobRefused>()('JobRefused', {
  queue: Schema.String,
  reason: Schema.String,
}) {}

export type EnqueueOptions = {
  readonly startAfter?: DateTime.Utc | undefined;
  readonly singletonKey?: string | undefined;
  readonly correlate?: boolean | undefined;
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
  /** The clock is read once here, so `Transaction` stays `enqueue`'s only requirement. */
  static readonly layer = (config: JobsConfig): Layer.Layer<Jobs> =>
    Layer.effect(
      Jobs,
      Effect.map(JobClock, (clock) =>
        Jobs.of({ enqueue: makeEnqueue(config, clock) }),
      ),
    );

  static readonly layerRecording: Layer.Layer<Jobs | RecordedJobs> =
    Layer.effectContext(
      Effect.sync(() => {
        const recorded: RecordedJob[] = [];
        let next = 0;
        const enqueue = Effect.fnUntraced(function* <
          Queue extends JobQueueName,
        >(queue: Queue, payload: JobPayload<Queue>, options?: EnqueueOptions) {
          const encoded = yield* encodePayload(queue, payload);
          // Requires the service without using it: a recorded enqueue must be no easier to
          // reach than a real one.
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

const encodePayload = <Queue extends JobQueueName>(
  queue: Queue,
  payload: JobPayload<Queue>,
): Effect.Effect<EncodedJobPayload<Queue>> =>
  Effect.orDie(payloadCodec(queue).encode(payload));

const decodeCorrelation = Schema.decodeUnknownOption(
  JobCorrelationSchema,
  JOB_PAYLOAD_PARSE_OPTIONS,
);

const currentCorrelation: Effect.Effect<JobCorrelation | null> = Effect.map(
  Effect.option(Effect.currentParentSpan),
  (span) =>
    Option.getOrNull(
      Option.flatMap(span, ({ traceId, spanId, sampled }) =>
        decodeCorrelation({
          traceparent: `00-${traceId}-${spanId}-${sampled ? '01' : '00'}`,
        }),
      ),
    ),
);

const makeEnqueue = (config: JobsConfig, clock: JobClockShape) => {
  const schema = assertSchemaName(config.schema);

  return Effect.fnUntraced(function* <Queue extends JobQueueName>(
    queue: Queue,
    payload: JobPayload<Queue>,
    options?: EnqueueOptions,
  ) {
    const encoded = yield* encodePayload(queue, payload);
    const { sql } = yield* Transaction;
    const now = yield* clock.now;
    const correlation =
      options?.correlate === false ? null : yield* currentCorrelation;
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
      correlation,
    });

    // Not the caller's to recover: the transaction is already aborted.
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
