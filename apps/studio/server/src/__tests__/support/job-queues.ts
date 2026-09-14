import type pg from 'pg';

import { jobQueueDefinitions } from '../../jobs/queues.ts';

// What a queue is, as a row: the declarations in studio-sync rendered the way
// pg-boss stores them. Shared by the schema suite, which asserts that
// `applySchema` creates and updates them, and by the job suites, which assert
// that the scratch schemas every other suite provisions carry the same ones —
// a scratch queue created with a different retry or expiry would make a job
// test pass against options no deployment has.

/**
 * pg-boss's defaults for the options a declaration leaves out, so what is
 * asserted is the declaration itself rather than a copy of the rows.
 */
const PG_BOSS_QUEUE_DEFAULTS = {
  policy: 'standard',
  retryLimit: 2,
  retryDelay: 0,
  retryBackoff: false,
  retryDelayMax: null,
  expireInSeconds: 900,
  retentionSeconds: 1_209_600,
  deleteAfterSeconds: 604_800,
  deadLetter: null,
  notify: false,
};

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
  dead_letter: string | null;
  notify: boolean;
};

export function declaredQueueRows(): QueueRow[] {
  return jobQueueDefinitions()
    .map(({ name, options }) => {
      const queue = { ...PG_BOSS_QUEUE_DEFAULTS, ...options };
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
        dead_letter: queue.deadLetter,
        notify: queue.notify,
      };
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export async function installedQueueRows(
  pool: pg.Pool,
  schema: string,
): Promise<QueueRow[]> {
  const rows = await pool.query<QueueRow>(
    `select name, policy, retry_limit, retry_delay, retry_backoff,
            retry_delay_max, expire_seconds, retention_seconds,
            deletion_seconds, dead_letter, notify
     from ${schema}.queue order by name`,
  );
  return rows.rows;
}
