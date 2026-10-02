import type { JobPayload, JobQueueName } from '@codaco/studio-sync/jobs';

import { resolvedQueue } from './queues.ts';
import { assertSchemaName } from './schema.ts';

export type JobInsertStatement = {
  readonly text: string;
  readonly values: readonly unknown[];
};

export type JobInsertInput<Queue extends JobQueueName> = {
  readonly schema: string;
  readonly queue: Queue;
  readonly payload: JobPayload<Queue>;
  readonly singletonKey: string | null;
  readonly now: Date | null;
  readonly startAfter: Date | null;
};

/**
 * Every timestamp is cast explicitly: a bare `$n` used both as a column value and
 * inside an interval expression leaves Postgres to infer its type from whichever
 * context it resolves first.
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
