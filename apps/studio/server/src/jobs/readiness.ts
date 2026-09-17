import { Effect, Option, Schema } from 'effect';

import { MaintenanceDatabase } from '../db/client.ts';
import type { CheckVerdict, HealthCheck } from '../http/health.ts';
import { deepestMessage } from './errors.ts';
import { JobWorker } from './worker.ts';

// The `jobs` entry of the worker process's readiness probe (src/http/health.ts
// `HealthChecks`). A process that runs jobs and cannot reach its queue tables
// is not ready, and the probe has to say so rather than let the deployment
// infer health from the process still being alive.

/**
 * The worker has not read its tables yet. A tagged failure rather than a
 * string so the reason `readiness` prints comes from one place; it extends
 * `Error`, which is what `health.ts`'s `reasonOf` reads.
 */
class JobWorkerNotReady extends Schema.TaggedError<JobWorkerNotReady>()(
  'JobWorkerNotReady',
  { message: Schema.String },
) {}

/**
 * The read itself failed. The `SqlError` is not reported as it arrives: its
 * own message is always `PgConnection: Query failed` (errors.ts), and a probe
 * whose whole job is to name the failing dependency must carry the Postgres
 * error underneath it — `permission denied for table jobs` is the line an
 * operator can act on.
 */
class JobQueuesUnreadable extends Schema.TaggedError<JobQueuesUnreadable>()(
  'JobQueuesUnreadable',
  { message: Schema.String },
) {}

/**
 * Ready means both halves: the worker has read the queue tables at least once
 * (`JobWorker.ready`, set by the worker's own first answered claim query and
 * by `queueDepths` — worker.ts), and a read issued *now* answers. The order
 * matters and is the whole of the check's honesty: `queueDepths` is itself one
 * of the reads that makes the worker ready, so asking it first would make the
 * probe its own evidence.
 *
 * The flag comes off the worker's own polling rather than off an optional
 * layer deliberately. A worker that mounted `jobsCheck` without
 * `JobQueueMetrics.layer` used to report not ready for the life of the
 * process, because nothing but the metrics pass ever set it — a wiring
 * obligation encoded in a comment, of the kind a deployment discovers at three
 * in the morning.
 *
 * Reaching the queue is the failing half: a worker that cannot read its tables
 * is unfit for the only thing it does. The listener is the degraded half — a
 * worker whose `LISTEN` is down still claims every job it has, only on its
 * poll interval instead of on the announcement, so the loss changes latency
 * rather than fitness, and taking the container out of rotation for it would
 * turn a slow queue into a stopped one. It is reported at all because the
 * alternative is inferring it from log volume, which is what the round-2
 * review objected to. A worker that was never asked to listen answers `None`
 * and is `ok`: there is nothing down.
 *
 * A worker is `ready` before its first acquire on a boot of a few
 * milliseconds, so a probe that lands in that window reads `degraded` for one
 * answer. That is the honest reading — the listener is in fact not up yet —
 * and `degraded` is not a 503.
 */
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

/**
 * The check as `HealthChecks` takes it — every dependency provided, because a
 * probe is assembled where the process is, not where the check is written.
 * The client is passed rather than taken from a layer so the process that
 * mounts this runs the check as the role it actually works jobs as, which is
 * what makes a grant problem show up here instead of in the first claim.
 */
export const jobsCheck = (
  worker: JobWorker['Service'],
  database: MaintenanceDatabase['Service'],
): HealthCheck =>
  check.pipe(
    Effect.provideService(JobWorker, worker),
    Effect.provideService(MaintenanceDatabase, database),
  );
