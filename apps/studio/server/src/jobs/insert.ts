import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { type JobPayload, resolvedQueue } from './queues.ts';
import { assertSchemaName } from './schema.ts';

// The one statement that creates a job, rendered as text and bound values so
// that both enqueue paths send exactly it: `Jobs.enqueue` (jobs.ts) over the
// Effect transaction, and the web process's node-postgres twin
// (src/jobs/client.ts) on a command's `pg.PoolClient`. It lives apart from
// jobs.ts so the web process's module graph reaches no `@effect/sql-pg` for
// it — that process runs its commands on node-postgres until stage 3 of #1927.

/** One `INSERT … RETURNING id`, in the shape both enqueue paths can send. */
export type JobInsertStatement = {
  readonly text: string;
  /** Bound, never interpolated; `$1` is `values[0]`, as pg numbers them. */
  readonly values: readonly unknown[];
};

export type JobInsertInput<Queue extends JobQueueName> = {
  readonly schema: string;
  readonly queue: Queue;
  /** Already decoded against the queue's codec by the caller. */
  readonly payload: JobPayload<Queue>;
  readonly singletonKey: string | null;
  /**
   * The instant the row is created at, and the `run_at` unless `startAfter`
   * overrides it. `null` asks the database for its own `now()`: the
   * node-postgres path has no `JobClock` to read, and the database's clock is
   * the one the correction in clock.ts converges on anyway.
   */
  readonly now: Date | null;
  readonly startAfter: Date | null;
};

/**
 * The one place a job row is composed. Both enqueue paths call it, so the
 * columns frozen at enqueue — the policy, the whole retry ladder, the lease —
 * cannot differ by which process created the job.
 *
 * `keep_until` is computed in SQL rather than in either caller's language,
 * because with `now()` as the run instant there is no JavaScript value to add
 * the retention to; doing it one way for both is what keeps the two paths one
 * statement. Every timestamp is cast explicitly: a bare `$n` used both as a
 * column value and inside an interval expression leaves Postgres to infer the
 * parameter's type from whichever context it resolves first.
 */
export function insertJobStatement<Queue extends JobQueueName>(
  input: JobInsertInput<Queue>,
): JobInsertStatement {
  const schema = assertSchemaName(input.schema);
  const declaration = resolvedQueue(input.queue);
  const values: unknown[] = [];
  const bind = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };
  const createdAt =
    input.now === null ? 'now()' : `${bind(input.now)}::timestamptz`;
  const runAt =
    input.startAfter === null
      ? createdAt
      : `${bind(input.startAfter)}::timestamptz`;

  const text = `
    INSERT INTO ${schema}.jobs
      (queue, payload, state, policy, attempts, singleton_key,
       retry_limit, retry_delay, retry_backoff, retry_delay_max,
       expire_in_seconds, run_at, keep_until, created_at)
    VALUES (
      ${bind(input.queue)},
      ${bind(JSON.stringify(input.payload))}::jsonb,
      'created',
      ${bind(declaration.policy)},
      0,
      ${bind(input.singletonKey)},
      ${bind(declaration.retryLimit)},
      ${bind(declaration.retryDelay)},
      ${bind(declaration.retryBackoff)},
      ${bind(declaration.retryDelayMax)},
      ${bind(declaration.expireInSeconds)},
      ${runAt},
      ${runAt} + ${bind(declaration.retentionSeconds)}::double precision
                 * interval '1 second',
      ${createdAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING id`;

  return { text, values };
}
