import { Effect, Option, Schema } from 'effect';

import { MaintenanceDatabase } from '../db/client.ts';
import type { CheckVerdict, HealthCheck } from '../http/health.ts';
import { deepestMessage } from './errors.ts';
import { JobWorker } from './worker.ts';

class JobWorkerNotReady extends Schema.TaggedError<JobWorkerNotReady>()(
  'JobWorkerNotReady',
  { message: Schema.String },
) {}

/** The `SqlError`'s own message is always `PgConnection: Query failed`, so the Postgres error underneath is carried. */
class JobQueuesUnreadable extends Schema.TaggedError<JobQueuesUnreadable>()(
  'JobQueuesUnreadable',
  { message: Schema.String },
) {}

/** Order matters: `queueDepths` itself makes the worker ready, so asking it first would make the probe its own evidence. */
const check: Effect.Effect<
  CheckVerdict,
  unknown,
  JobWorker | MaintenanceDatabase
> = Effect.gen(function* () {
  const worker = yield* JobWorker;
  if (!(yield* worker.ready)) {
    return yield* new JobWorkerNotReady({
      message: 'the job worker has not read its queues yet',
    });
  }
  yield* Effect.mapError(
    worker.queueDepths,
    (error) =>
      new JobQueuesUnreadable({
        message: deepestMessage(error) ?? String(error),
      }),
  );
  const listening = yield* worker.listening;
  const verdict: CheckVerdict = Option.getOrElse(listening, () => true)
    ? 'ok'
    : 'degraded';
  return verdict;
});

export const jobsCheck = (
  worker: JobWorker['Service'],
  database: MaintenanceDatabase['Service'],
): HealthCheck =>
  check.pipe(
    Effect.provideService(JobWorker, worker),
    Effect.provideService(MaintenanceDatabase, database),
  );
