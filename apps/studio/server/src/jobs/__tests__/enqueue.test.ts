// The web process's enqueue: a job and the change that caused it are one
// transaction, or neither happened — and the row it writes is the row the
// worker's own `Jobs.enqueue` would have written.
//
// The second half is why this file compares the two paths rather than asserting
// literals. The columns frozen at enqueue are what a job in flight retries and
// expires by, so a node-postgres twin that drifted from the Effect path by one
// column would give a deployment two retry ladders depending on which process
// created the job — and nothing would say so.
import { randomUUID } from 'node:crypto';

import { Context, DateTime, Effect, Exit, Layer, Scope } from 'effect';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { JOB_QUEUES, type JobQueueName } from '@codaco/studio-sync/jobs';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import { createJobClient, type JobClient } from '../client.ts';
import { Database, withTransaction } from '../database.ts';
import { type EnqueueOptions, Jobs } from '../jobs.ts';
import { type JobPayload, resolvedQueue } from '../queues.ts';
import { payloadFor } from './support.ts';

const db = await reachableDb();

/**
 * A client that answers every statement with a failure nothing else produces.
 * Passing one proves a refusal happened before the enqueue reached the
 * database, which is the difference between a rejected call and a caller's
 * transaction left in an aborted state.
 */
function refusingClient(): pg.PoolClient {
  return {
    query: () => {
      throw new Error('the enqueue reached the database');
    },
    release: () => undefined,
  } as unknown as pg.PoolClient;
}

/**
 * Every column the enqueue freezes onto the row, plus the retention window as
 * a duration rather than an instant: the two paths read their "now" from
 * different clocks by design — this process has none, so it uses the database's
 * — and comparing absolute timestamps would only measure that.
 */
type FrozenRow = {
  queue: string;
  state: string;
  policy: string;
  attempts: number;
  payload: unknown;
  singleton_key: string | null;
  retry_limit: number;
  retry_delay: number;
  retry_backoff: boolean;
  retry_delay_max: number | null;
  expire_in_seconds: number;
  retention_seconds: number;
};

describe.skipIf(!db)('the web process enqueue', () => {
  let scratch: ScratchSchema;
  let jobs: JobClient;
  let scope: Scope.Closeable;
  let jobsService: Jobs['Service'];
  let database: Database['Service'];

  const jobRows = async (queue?: string): Promise<FrozenRow[]> => {
    const rows = await scratch.pool.query<FrozenRow>(
      `select queue, state, policy, attempts, payload, singleton_key,
              retry_limit, retry_delay, retry_backoff, retry_delay_max,
              expire_in_seconds,
              extract(epoch from (keep_until - run_at))::int as retention_seconds
         from ${scratch.jobSchema}.jobs
        where $1::text is null or queue = $1
        order by created_at, id`,
      [queue ?? null],
    );
    return rows.rows;
  };

  const countJobs = async (pool: pg.Pool): Promise<number> => {
    const rows = await pool.query<{ count: string }>(
      `select count(*) as count from ${scratch.jobSchema}.jobs`,
    );
    return Number(rows.rows[0]!.count);
  };

  /** The whole retention window of a queue, straight off its declaration. */
  const declaredRetentionSeconds = (queue: JobQueueName): number =>
    resolvedQueue(queue).retentionSeconds;

  /** The worker's own enqueue, on the same schema and as the same role. */
  const effectEnqueue = <Queue extends JobQueueName>(
    queue: Queue,
    payload: JobPayload<Queue>,
    options?: EnqueueOptions,
  ): Promise<string> =>
    Effect.runPromise(
      Effect.provideService(
        withTransaction(jobsService.enqueue(queue, payload, options)),
        Database,
        database,
      ),
    );

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    jobs = createJobClient({ schema: scratch.jobSchema });

    scope = Effect.runSync(Scope.make());
    const built = await Effect.runPromise(
      Layer.buildWithScope(
        Jobs.layer({ schema: scratch.jobSchema }).pipe(
          Layer.provideMerge(
            Database.layer('app', {
              url: db.url,
              maxConnections: 4,
              applicationName: 'studio-enqueue-twin',
            }),
          ),
        ),
        scope,
      ),
    );
    jobsService = Context.get(built, Jobs);
    database = Context.get(built, Database);
  });

  afterEach(async () => {
    await scratch.pool.query(`delete from ${scratch.jobSchema}.jobs`);
  });

  afterAll(async () => {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await scratch.dispose();
  });

  it('leaves no job behind when it rolls back, and one when it commits', async () => {
    // The two halves are one case because neither is worth anything alone: a
    // rollback that leaves no row proves nothing about an enqueue that never
    // wrote one, and a commit that leaves one proves nothing about where the
    // write went.
    const rolledBack = await scratch.app.connect();
    try {
      await rolledBack.query('BEGIN');
      const jobId = await jobs.enqueue(rolledBack, 'invitation-delivery', {
        deliveryId: randomUUID(),
      });
      expect(jobId).toEqual(expect.any(String));
      await rolledBack.query('ROLLBACK');
    } finally {
      rolledBack.release();
    }
    expect(await jobRows()).toEqual([]);

    const deliveryId = randomUUID();
    const committed = await scratch.app.connect();
    try {
      await committed.query('BEGIN');
      await jobs.enqueue(committed, 'invitation-delivery', { deliveryId });
      await committed.query('COMMIT');
    } finally {
      committed.release();
    }
    expect(await jobRows()).toMatchObject([
      {
        queue: 'invitation-delivery',
        state: 'created',
        payload: { deliveryId },
      },
    ]);
  });

  it('is invisible to another connection until the caller commits', async () => {
    // The oracle that "in the transaction" means what it says: under
    // read-committed isolation a second pool can only see nothing here if the
    // insert really ran on the caller's own connection.
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      await jobs.enqueue(client, 'sign-in-email', payloadFor('sign-in-email'));
      expect(await countJobs(scratch.pool)).toBe(0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(await countJobs(scratch.pool)).toBe(1);
  });

  it.each(JOB_QUEUES.map(({ name }) => name))(
    'freezes the same columns onto a %s job as the worker’s own enqueue',
    async (queue) => {
      await effectEnqueue(queue, payloadFor(queue));

      const client = await scratch.app.connect();
      try {
        await client.query('BEGIN');
        await jobs.enqueue(client, queue, payloadFor(queue));
        await client.query('COMMIT');
      } finally {
        client.release();
      }

      const [throughEffect, throughPg] = await jobRows(queue);
      expect(throughPg, 'the node-postgres enqueue wrote no row').toBeDefined();
      // Column for column, the payload apart — the two rows carry payloads
      // built separately, and what is being compared is the enqueue's own
      // decisions rather than the caller's data.
      expect({ ...throughPg, payload: null }).toEqual({
        ...throughEffect,
        payload: null,
      });
    },
  );

  it('holds a deferred job for its whole retention after the instant it may run', async () => {
    // The drift matrix above compares the two paths against each other, so a
    // `keep_until` both paths got wrong the same way — they share
    // `insertJobStatement` — reads as no drift at all. This is the absolute
    // half, and it is the only row where `run_at` and `created_at` differ:
    // with `startAfter` unset they are the same instant, and
    // `created_at + retention` and `run_at + retention` are then the same
    // number however the statement computes it.
    //
    // `startAfter` is the option that separates them. `keep_until` is the
    // point a job nothing ever claimed is deleted at rather than retried
    // (schema.ts, `jobs_keep_until_idx`), so computing it from the creation
    // instead of the run instant would spend the retention window while the
    // job was still deferred — and a job deferred by longer than its retention
    // would be swept before it was ever claimable.
    //
    // Mutation: `${runAt} + ...` → `${createdAt} + ...` in insert.ts's
    // `keep_until` expression. Both rows then report
    // `retention - DEFERRED_BY_SECONDS`.
    const queue = 'invitation-delivery';
    const DEFERRED_BY_SECONDS = 3600;
    const startAfter = new Date(Date.now() + DEFERRED_BY_SECONDS * 1000);

    await effectEnqueue(queue, payloadFor(queue), {
      startAfter: DateTime.fromDateUnsafe(startAfter),
    });

    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      await jobs.enqueue(client, queue, payloadFor(queue), { startAfter });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const rows = await scratch.pool.query<{
      deferred_by_seconds: number;
      retention_seconds: number;
    }>(
      `select extract(epoch from (run_at - created_at))::int as deferred_by_seconds,
              extract(epoch from (keep_until - run_at))::int  as retention_seconds
         from ${scratch.jobSchema}.jobs
        where queue = $1
        order by created_at, id`,
      [queue],
    );

    const retention = declaredRetentionSeconds(queue);
    // One row per path.
    expect(rows.rows).toHaveLength(2);
    for (const [index, row] of rows.rows.entries()) {
      // The precondition, loosely: `created_at` is the database's `now()` on
      // one path and this process's clock on the other, and neither is the
      // instant `startAfter` was computed from — so what is asserted is that
      // the two instants are genuinely an hour apart, not that they are that
      // to the second.
      expect(row.deferred_by_seconds, `row ${index}`).toBeGreaterThan(
        DEFERRED_BY_SECONDS - 60,
      );
      // The oracle, exactly: `keep_until - run_at` is a difference of two
      // instants the statement derives from the same bound parameter, so no
      // clock enters it.
      expect(row.retention_seconds, `row ${index}`).toBe(retention);
    }
  });

  it('refuses an undeclared queue before it reaches the database', async () => {
    await expect(
      jobs.enqueue(
        refusingClient(),
        // Only a caller that has bypassed the types can get here, which is
        // exactly when a run-time refusal is worth having.
        'invitation-delivery-typo' as JobQueueName,
        { deliveryId: randomUUID() },
      ),
    ).rejects.toThrow(/no job queue is declared as "invitation-delivery-typo"/);
  });

  it('refuses a payload its queue does not admit, before the database', async () => {
    await expect(
      jobs.enqueue(refusingClient(), 'invitation-delivery', {
        deliveryId: 'not-a-delivery-id',
      }),
    ).rejects.toThrow(/deliveryId/);

    await expect(
      jobs.enqueue(refusingClient(), 'invitation-delivery', {
        deliveryId: randomUUID(),
        // A field the payload policy never saw.
        email: 'researcher@example.org',
      } as never),
    ).rejects.toThrow(/email/);
  });

  it('refuses a job that collides on a singleton key, naming the queue', async () => {
    const singletonKey = `key-${randomUUID()}`;
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      await jobs.enqueue(
        client,
        'invitation-delivery',
        { deliveryId: randomUUID() },
        { singletonKey },
      );
      // `ON CONFLICT DO NOTHING` returns no row rather than raising, so the
      // caller's transaction is still healthy. The `COMMIT` below is not what
      // says so — Postgres answers `COMMIT` in an aborted block with a silent
      // `ROLLBACK` rather than an error — so the oracle is the row count
      // afterwards: a transaction the collision had aborted would have taken
      // the first job down with it and left none.
      await expect(
        jobs.enqueue(
          client,
          'invitation-delivery',
          { deliveryId: randomUUID() },
          { singletonKey },
        ),
      ).rejects.toThrow(
        /invitation-delivery refused the job: it collided with one already queued/,
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    expect(await jobRows('invitation-delivery')).toHaveLength(1);
  });
});
