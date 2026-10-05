// The web process's enqueue-only pg-boss: when it connects, what it refuses to
// start against, and whose connections it uses.
//
// The last of those is the reason it owns a pool rather than borrowing the one
// that serves requests. pg-boss reads its queue cache on the instance
// connection, so a cold cache during an enqueue checks out a second connection
// — and the caller is inside a transaction holding one of its own.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  declaredQueueRows,
  installedQueueRows,
} from '../../__tests__/support/job-queues.ts';
import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
  sqlState,
} from '../../__tests__/support/postgres.ts';
import { settlesWithin } from '../../__tests__/support/timing.ts';
import { createPool } from '../../db/pool.ts';

const db = await reachableDb();

/** Long enough for a connection and a query; short enough to fail a hang. */
const STOP_BUDGET_MS = 5000;

describe.skipIf(!db)('createJobClient', () => {
  let scratch: ScratchSchema;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
  });

  afterAll(async () => {
    await scratch.dispose();
  });

  // Every other job case runs against a scratch schema rather than an applied
  // one, so what those cases prove is only about deployments if the queues
  // here are the declared queues. The applied path is asserted the same way in
  // src/__tests__/schema.test.ts.
  it('provisions a scratch schema with the declared queues', async () => {
    expect(await installedQueueRows(scratch.pool, scratch.jobSchema)).toEqual(
      declaredQueueRows(),
    );
  });

  it('enqueues from a held single-connection pool with a cold cache', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const jobs = await scratch.createJobClient({ start: false });
    // One connection, and the caller is holding it for the whole transaction.
    // A client that read its queue cache on this pool would wait here for a
    // connection only the caller can return, until the connection timeout.
    const app = createPool(db, { max: 1 });
    try {
      const connection = await app.connect();
      try {
        await connection.query('BEGIN');
        // Also the lazy start: this client was never started by hand, which is
        // how the web process reaches a queue on a database whose schema
        // became current after it booted.
        const jobId = await settlesWithin(
          jobs.enqueue(connection, 'protocol-store-gc', {}),
          STOP_BUDGET_MS,
          'the enqueue',
        );
        expect(jobId).toEqual(expect.any(String));
        await connection.query('COMMIT');
      } finally {
        connection.release();
      }
    } finally {
      await app.end();
      await jobs.stop();
    }
  });

  it('stops whether or not it ever started', async () => {
    const unstarted = await scratch.createJobClient({ start: false });
    // Nothing to shut down: pg-boss emits no `stopped` for an instance that
    // never ran, so a stop that waited for one would never return.
    await settlesWithin(unstarted.stop(), STOP_BUDGET_MS, 'an unstarted stop');

    const started = await scratch.createJobClient();
    await settlesWithin(started.stop(), STOP_BUDGET_MS, 'the first stop');
    await settlesWithin(started.stop(), STOP_BUDGET_MS, 'the second stop');
  });

  describe('starting against a database it cannot enqueue into', () => {
    let broken: ScratchSchema;

    beforeAll(async () => {
      if (!db) throw new Error('unreachable: probe guaranteed a database');
      broken = await createScratchSchema(db);
      await provisionScratchSchema(broken.pool);
    });

    afterAll(async () => {
      await broken.dispose();
    });

    it('refuses a queue table it cannot read, and retries when it can', async () => {
      // pg-boss's own start swallows what the first queue-cache read answers,
      // so without a check of our own this client would report a healthy boot
      // and fail on the first enqueue instead — with the request that made it.
      await broken.pool.query(
        `revoke select on ${broken.jobSchema}.queue from ${TENANT_ROLES.app}`,
      );
      const jobs = await broken.createJobClient({ start: false });
      const refusal = await jobs.start().then(
        () =>
          new Error('the client started against a queue table it cannot read'),
        (error: unknown) => error,
      );
      expect(sqlState(refusal), String(refusal)).toBe('42501');

      await broken.pool.query(
        `grant select on ${broken.jobSchema}.queue to ${TENANT_ROLES.app}`,
      );
      // A failed start is not the answer for the life of the process: the
      // reason it failed is one a later attempt may find fixed, and the next
      // enqueue is what asks again.
      const connection = await broken.app.connect();
      try {
        await connection.query('BEGIN');
        await expect(
          jobs.enqueue(connection, 'protocol-store-gc', {}),
        ).resolves.toEqual(expect.any(String));
        await connection.query('ROLLBACK');
      } finally {
        connection.release();
        await jobs.stop();
      }
    });

    it('refuses a database missing a queue this build declares', async () => {
      // A deployment that added a queue and started the web process before the
      // schema was applied. The insert would fail with `queue not found` on
      // the first job for it, which is a request-time failure for something
      // this process could see at start.
      await broken.pool.query(
        `delete from ${broken.jobSchema}.queue where name = 'sign-in-email'`,
      );
      const jobs = await broken.createJobClient({ start: false });
      try {
        await expect(jobs.start()).rejects.toThrow(/sign-in-email/);
      } finally {
        await jobs.stop();
      }
    });
  });
});
