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

import { Context, Effect, Exit, Layer, Scope } from 'effect';
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
import { Database, withTransaction } from '../effect/database.ts';
import { Jobs } from '../effect/jobs.ts';
import type { JobPayload } from '../effect/queues.ts';

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

/** A valid payload per queue, so every declaration is exercised below. */
function payloadFor(queue: JobQueueName): JobPayload<JobQueueName> {
  if (queue === 'sign-in-email') {
    return {
      email: 'researcher@example.org',
      url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
    };
  }
  if (queue.startsWith('invitation-delivery')) {
    return { deliveryId: randomUUID() };
  }
  // The two scheduled sweeps visit everything there is; nothing addresses them.
  return {};
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
         from ${scratch.nativeJobSchema}.jobs
        where $1::text is null or queue = $1
        order by created_at, id`,
      [queue ?? null],
    );
    return rows.rows;
  };

  const countJobs = async (pool: pg.Pool): Promise<number> => {
    const rows = await pool.query<{ count: string }>(
      `select count(*) as count from ${scratch.nativeJobSchema}.jobs`,
    );
    return Number(rows.rows[0]!.count);
  };

  /** The worker's own enqueue, on the same schema and as the same role. */
  const effectEnqueue = <Queue extends JobQueueName>(
    queue: Queue,
    payload: JobPayload<Queue>,
    options?: { readonly singletonKey?: string },
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
    jobs = createJobClient({ schema: scratch.nativeJobSchema });

    scope = Effect.runSync(Scope.make());
    const built = await Effect.runPromise(
      Layer.buildWithScope(
        Jobs.layer({ schema: scratch.nativeJobSchema }).pipe(
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
    await scratch.pool.query(`delete from ${scratch.nativeJobSchema}.jobs`);
  });

  afterAll(async () => {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await scratch.dispose();
  });

  it('leaves no job behind when the transaction rolls back', async () => {
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      const jobId = await jobs.enqueue(client, 'invitation-delivery', {
        deliveryId: randomUUID(),
      });
      expect(jobId).toEqual(expect.any(String));
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    expect(await jobRows()).toEqual([]);
  });

  it('leaves exactly one job when the transaction commits', async () => {
    const deliveryId = randomUUID();
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      await jobs.enqueue(client, 'invitation-delivery', { deliveryId });
      await client.query('COMMIT');
    } finally {
      client.release();
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
      // caller's transaction is still healthy — which is why the next
      // statement below succeeds instead of failing with `25P02`.
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
