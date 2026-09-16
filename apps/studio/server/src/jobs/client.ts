import { Cause, Effect, Exit } from 'effect';
import type pg from 'pg';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { insertJobStatement } from './effect/insert.ts';
import {
  type JobPayload,
  payloadCodec,
  resolvedQueue,
} from './effect/queues.ts';
import { NATIVE_JOB_SCHEMA } from './queues.ts';

// The web process's enqueue, and the only module outside `src/jobs/effect` that
// creates a job — a source-policy test pins that.
//
// It is a node-postgres twin of `Jobs.enqueue` because the commands that create
// jobs still run on `pg.PoolClient` and Drizzle transactions (#1927 stage 3
// moves them to Effect). It holds no pool and opens no connection: one
// `INSERT … RETURNING id` on the client it is handed, which is the whole of the
// transaction guarantee for this path — the job and the domain row the caller is
// writing commit together or not at all. The statement is rendered by
// `insertJobStatement`, the same function the Effect path sends, so the columns
// frozen onto a job at enqueue cannot differ by which process created it.

export type JobClientOptions = {
  /** The suites provision a job schema per scratch database. */
  schema?: string;
};

export type JobEnqueueOptions = {
  /**
   * One job per (queue, key) among `created` and `active`; a second is
   * refused. Unrelated to a queue's `singleton` *policy*, which bounds how many
   * run at once and lets the rest wait (`src/jobs/effect/README.md` §2).
   */
  readonly singletonKey?: string;
  /** Not claimable before this instant; the default is the commit's own. */
  readonly startAfter?: Date;
};

export type JobClient = {
  enqueue<Queue extends JobQueueName>(
    client: pg.PoolClient,
    queue: Queue,
    data: JobPayload<Queue>,
    options?: JobEnqueueOptions,
  ): Promise<string>;
};

/**
 * Parsed rather than merely checked, and with excess properties refused: what
 * is stored is what the queue's schema admits. It runs before the statement is
 * rendered, so a payload the queue does not admit never touches the caller's
 * transaction — a statement that raised would abort it, and with it whatever
 * domain work was committing alongside.
 */
function decodePayload<Queue extends JobQueueName>(
  queue: Queue,
  data: JobPayload<Queue>,
): JobPayload<Queue> {
  // Synchronous by construction: a `Schema` decode issues no effect, so this
  // cannot be the place a Promise-shaped caller is made to wait.
  const decoded = Effect.runSyncExit(payloadCodec(queue).decode(data));
  if (Exit.isFailure(decoded)) {
    throw new Error(
      `${queue} refused the payload: ${Cause.pretty(decoded.cause)}`,
    );
  }
  return decoded.value;
}

/**
 * Built without touching the database, because there is nothing to connect:
 * every statement runs on a connection the caller already holds. A client can
 * therefore be made before the schema is current — which the development lane
 * needs, since `pnpm dev` can finish applying the schema long after the web
 * process booted.
 */
export function createJobClient(options: JobClientOptions = {}): JobClient {
  const schema = options.schema ?? NATIVE_JOB_SCHEMA;

  return {
    enqueue: async (client, queue, data, enqueueOptions) => {
      // Refused here rather than by the insert: a queue name that is not
      // declared reaches this only by bypassing the types, and there is no
      // statement that could answer for it.
      resolvedQueue(queue);
      const payload = decodePayload(queue, data);
      const statement = insertJobStatement({
        schema,
        queue,
        payload,
        singletonKey: enqueueOptions?.singletonKey ?? null,
        // The database's own clock. This process has no `JobClock` — the skew
        // correction is measured by the worker against the same `now()` — and
        // reading the job's instants off the transaction that writes them is
        // the one choice that cannot disagree with it.
        now: null,
        startAfter: enqueueOptions?.startAfter ?? null,
      });

      const result = await client.query<{ id: string }>(statement.text, [
        ...statement.values,
      ]);
      const inserted = result.rows[0];
      // `ON CONFLICT DO NOTHING` returns no row on a `singletonKey` collision,
      // and silently dropping the work is the one outcome the transactional
      // enqueue exists to prevent. Raising the unique violation instead would
      // abort the caller's whole transaction over an ordinary "already
      // queued".
      if (inserted === undefined) {
        throw new Error(
          `${queue} refused the job: it collided with one already queued`,
        );
      }
      return inserted.id;
    },
  };
}
