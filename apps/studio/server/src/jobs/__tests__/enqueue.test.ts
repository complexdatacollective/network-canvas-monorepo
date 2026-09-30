// A job and the change that caused it are one transaction, or neither
// happened. Everything else here is what stops a caller from reaching the
// queue with something the queue cannot answer for.
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import type { JobClient } from '../client.ts';

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

describe.skipIf(!db)('enqueueJob', () => {
  let scratch: ScratchSchema;
  let jobs: JobClient;

  const queuedJobs = async () => {
    const rows = await scratch.pool.query<{ name: string; data: unknown }>(
      `select name, data from ${scratch.jobSchema}.job_common order by created_on`,
    );
    return rows.rows;
  };

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    jobs = await scratch.createJobClient();
  });

  afterAll(async () => {
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

    expect(await queuedJobs()).toEqual([]);
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

    expect(await queuedJobs()).toEqual([
      { name: 'invitation-delivery', data: { deliveryId } },
    ]);
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

  it('refuses a job pg-boss declined to create', async () => {
    const id = randomUUID();
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      await jobs.enqueue(
        client,
        'invitation-delivery',
        { deliveryId: randomUUID() },
        { id },
      );
      // pg-boss answers a collision with `null` rather than an error, and
      // dropping the work silently is what the transactional enqueue exists
      // to prevent.
      await expect(
        jobs.enqueue(
          client,
          'invitation-delivery',
          { deliveryId: randomUUID() },
          { id },
        ),
      ).rejects.toThrow(/collided with one already queued/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
