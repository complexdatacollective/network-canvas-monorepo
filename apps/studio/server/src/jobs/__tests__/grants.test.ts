// What each role may do inside pg-boss's schema. The job table is one table
// for every team and nothing isolates it, so the role that serves requests may
// create a job and learn its id and no more: it cannot read a payload, take a
// job, alter one or delete one. The worker's role owns the schema's use.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
  sqlState,
} from '../../__tests__/support/postgres.ts';
import type { StudioMailer } from '../../auth/email.ts';
import type { JobClient } from '../client.ts';
import type { JobWorker } from '../worker.ts';

const db = await reachableDb();

const INSUFFICIENT_PRIVILEGE = '42501';

async function expectRefused(work: Promise<unknown>): Promise<void> {
  const refusal = await work.then(
    () => new Error('the statement was allowed'),
    (error: unknown) => error,
  );
  expect(sqlState(refusal), String(refusal)).toBe(INSUFFICIENT_PRIVILEGE);
}

const silentMailer: StudioMailer = {
  sendMagicLink: () => Promise.resolve(),
  sendTeamInvitation: () => Promise.resolve(),
};

describe.skipIf(!db)('pg-boss grants', () => {
  let scratch: ScratchSchema;
  let jobs: JobClient;

  beforeAll(async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    scratch = await createScratchSchema(db);
    await provisionScratchSchema(scratch.pool);
    jobs = await scratch.createJobClient();
  });

  afterAll(async () => {
    await scratch.dispose();
  });

  const enqueueGc = async (): Promise<string> => {
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      const jobId = await jobs.enqueue(client, 'protocol-store-gc', {});
      await client.query('COMMIT');
      return jobId;
    } finally {
      client.release();
    }
  };

  describe('the application role', () => {
    it('creates a job and reads back only its id', async () => {
      const jobId = await enqueueGc();

      // The two columns the insert's RETURNING and notify clause read.
      const readable = await scratch.app.query<{ id: string }>(
        `select id, start_after from ${scratch.jobSchema}.job_common where id = $1`,
        [jobId],
      );
      expect(readable.rows).toHaveLength(1);
    });

    it('cannot read a job payload or which queue it is on', async () => {
      await expectRefused(
        scratch.app.query(`select data from ${scratch.jobSchema}.job_common`),
      );
      // The queue name says which kind of work is waiting for which team, and
      // the insert never reads it back: it is written, not selected.
      await expectRefused(
        scratch.app.query(`select name from ${scratch.jobSchema}.job_common`),
      );
    });

    it('cannot alter or remove a job', async () => {
      await expectRefused(
        scratch.app.query(
          `update ${scratch.jobSchema}.job_common set state = 'completed'`,
        ),
      );
      await expectRefused(
        scratch.app.query(`delete from ${scratch.jobSchema}.job_common`),
      );
    });

    it('cannot take a job', async () => {
      await enqueueGc();
      // pg-boss's own fetch, so the refusal covers the statement a worker
      // would run rather than one written for the test.
      await expectRefused(jobs.boss.fetch('protocol-store-gc'));
    });

    it('cannot work a queue', async () => {
      // The client's own listener reports the failure; silencing it keeps the
      // suite's output readable and proves the line is written.
      const logged = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      const failed = new Promise<unknown>((resolve) => {
        jobs.boss.once('error', resolve);
      });
      const handled: string[] = [];

      await enqueueGc();
      await jobs.boss.work(
        'protocol-store-gc',
        { pollingIntervalSeconds: 0.5 },
        (batch) => {
          handled.push(...batch.map((job) => job.id));
          return Promise.resolve();
        },
      );

      try {
        expect(sqlState(await failed)).toBe(INSUFFICIENT_PRIVILEGE);
        expect(handled).toEqual([]);
        expect(logged).toHaveBeenCalled();
      } finally {
        await jobs.boss.offWork('protocol-store-gc');
        logged.mockRestore();
      }
    });

    it('cannot read the schedule pg-boss keeps for the worker', async () => {
      await expectRefused(
        scratch.app.query(`select * from ${scratch.jobSchema}.schedule`),
      );
    });
  });

  describe('the maintenance role', () => {
    let worker: JobWorker;

    beforeAll(async () => {
      worker = scratch.createJobWorker({ mailer: silentMailer });
      await worker.start();
    });

    afterAll(async () => {
      await worker.stop();
    });

    it('works a job through to completion', async () => {
      // Through the handler the worker registered, not one registered beside
      // it: two workers on one queue race for the job, and the outcome line is
      // how a deployment knows the registered one ran.
      const lines: string[] = [];
      const logged = vi.spyOn(console, 'log').mockImplementation((...args) => {
        lines.push(String(args[0]));
      });
      try {
        const jobId = await enqueueGc();

        await vi.waitFor(
          async () => {
            const state = await scratch.pool.query<{ state: string }>(
              `select state from ${scratch.jobSchema}.job_common where id = $1`,
              [jobId],
            );
            expect(state.rows[0]?.state).toBe('completed');
          },
          { timeout: 15_000, interval: 100 },
        );
        expect(
          lines.filter(
            (line) => line.includes(jobId) && line.includes('completed'),
          ),
        ).toHaveLength(1);
      } finally {
        logged.mockRestore();
      }
    });

    it('supervises the schema without a privilege error', async () => {
      // Maintenance touches every table pg-boss has; a missing grant here is
      // what would otherwise surface as a worker that quietly stops tidying up.
      await expect(worker.boss.supervise()).resolves.toBeUndefined();
    });
  });
});
