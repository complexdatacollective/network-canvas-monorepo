import type pg from 'pg';

import {
  jobQueueDefinitions,
  QUEUE_OPTION_DEFAULTS,
} from '../../jobs/queues.ts';

// What a queue is, as a row: the declarations in studio-sync rendered the way
// pg-boss stores them. Shared by the schema suite, which asserts that
// `applySchema` creates and updates them, and by the job suites, which assert
// that the scratch schemas every other suite provisions carry the same ones —
// a scratch queue created with a different retry or expiry would make a job
// test pass against options no deployment has.

export type QueueRow = {
  name: string;
  policy: string;
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  retry_delay_max: number | null;
  expire_seconds: number;
  retention_seconds: number;
  deletion_seconds: number;
  warning_queued: number;
  dead_letter: string | null;
  heartbeat_seconds: number | null;
  notify: boolean;
};

/**
 * A declaration as its row. The defaults are the reconciler's own table rather
 * than a copy of it, so a row that matches this matches what `syncJobQueues`
 * sends — including for an option no declaration mentions, which is the half
 * of reconciliation that resets drift rather than creating a queue.
 */
export function queueRowFor(
  name: string,
  options: Partial<typeof QUEUE_OPTION_DEFAULTS> & { policy?: string } = {},
): QueueRow {
  const queue = { policy: 'standard', ...QUEUE_OPTION_DEFAULTS, ...options };
  return {
    name,
    policy: queue.policy,
    retry_limit: queue.retryLimit,
    retry_delay: queue.retryDelay,
    retry_backoff: queue.retryBackoff,
    retry_delay_max: queue.retryDelayMax,
    expire_seconds: queue.expireInSeconds,
    retention_seconds: queue.retentionSeconds,
    deletion_seconds: queue.deleteAfterSeconds,
    warning_queued: queue.warningQueueSize,
    dead_letter: queue.deadLetter,
    heartbeat_seconds: queue.heartbeatSeconds,
    notify: queue.notify,
  };
}

export function declaredQueueRows(): QueueRow[] {
  return jobQueueDefinitions()
    .map(({ name, options }) => queueRowFor(name, options))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function installedQueueRows(
  pool: pg.Pool,
  schema: string,
  names?: string[],
): Promise<QueueRow[]> {
  const rows = await pool.query<QueueRow>(
    `select name, policy, retry_limit, retry_delay, retry_backoff,
            retry_delay_max, expire_seconds, retention_seconds,
            deletion_seconds, warning_queued, dead_letter, heartbeat_seconds,
            notify
     from ${schema}.queue
     where $1::text[] is null or name = any($1::text[])
     order by name`,
    [names ?? null],
  );
  return rows.rows;
}
