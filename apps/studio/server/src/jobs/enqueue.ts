import type pg from 'pg';
import type { PgBoss, SendOptions } from 'pg-boss';

import {
  JOB_PAYLOAD_SCHEMAS,
  type JobPayload,
  type JobQueueName,
} from '@codaco/studio-sync/jobs';

import { jobDatabaseFor } from './database.ts';

// The only module in the server that creates a job. Everything else reaches a
// queue through `enqueueJob`, and a source-policy test pins that: an enqueue
// that ran on its own connection would reopen both windows the transactional
// path closes — a committed change with no job, and a job for a change that
// rolled back.

/** Per-job overrides; the transaction handle is not the caller's to choose. */
export type EnqueueOptions = Omit<SendOptions, 'db'>;

export async function enqueueJob<Queue extends JobQueueName>(
  boss: PgBoss,
  client: pg.PoolClient,
  queue: Queue,
  data: JobPayload<Queue>,
  options: EnqueueOptions = {},
): Promise<string> {
  const schema = JOB_PAYLOAD_SCHEMAS[queue];
  // A queue name that is not declared reaches this only by bypassing the
  // types, and pg-boss would answer it with a queue-not-found error after the
  // statement was already on its way. Refusing here keeps an undeclared queue
  // from touching the caller's transaction at all.
  if (schema === undefined) {
    throw new Error(`no job queue is declared as ${JSON.stringify(queue)}`);
  }

  // Parsed rather than merely checked: what is stored is what the schema
  // admits, so a handler reading it back cannot find a field the payload
  // policy forbids.
  const payload = schema.parse(data);

  const jobId = await boss.send(queue, payload, {
    ...options,
    db: jobDatabaseFor(client),
  });

  // pg-boss answers `null` when the insert was skipped — a duplicate id, or a
  // singleton or throttle collision. None of Studio's queues send with a key
  // that could collide, so a null here means the caller asked for something
  // the queue cannot do, and silently dropping the work is the one outcome the
  // transactional enqueue exists to prevent.
  if (jobId === null) {
    throw new Error(
      `${queue} refused the job: it collided with one already queued`,
    );
  }
  return jobId;
}
