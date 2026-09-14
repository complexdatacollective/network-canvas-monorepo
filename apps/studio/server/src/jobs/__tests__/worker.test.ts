// The worker process's pg-boss: that it never installs or migrates a schema,
// and that SIGTERM lets an in-flight job finish.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import type { StudioMailer } from '../../auth/email.ts';
import type { JobClient } from '../client.ts';

const db = await reachableDb();

const silentMailer: StudioMailer = {
  sendMagicLink: () => Promise.resolve(),
  sendTeamInvitation: () => Promise.resolve(),
};

describe.skipIf(!db)('createJobWorker', () => {
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

  const jobState = async (jobId: string): Promise<string | undefined> => {
    const state = await scratch.pool.query<{ state: string }>(
      `select state from ${scratch.jobSchema}.job_common where id = $1`,
      [jobId],
    );
    return state.rows[0]?.state;
  };

  it('starts against a schema apply-schema installed', async () => {
    const worker = scratch.createJobWorker({ mailer: silentMailer });
    await worker.start();
    try {
      expect(await worker.boss.isInstalled()).toBe(true);
    } finally {
      await worker.stop();
    }
  });

  it('refuses a database whose job schema is not installed', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed a database');
    const bare = await createScratchSchema(db);
    try {
      await provisionScratchSchema(bare.pool);
      await bare.pool.query(`drop schema "${bare.jobSchema}" cascade`);

      const worker = bare.createJobWorker({ mailer: silentMailer });
      await expect(worker.start()).rejects.toThrow(/pg-boss is not installed/);

      // The refusal is the point: a worker that installed what it found
      // missing could move a database out from under a web process that was
      // already serving requests against the schema it replaced.
      const rebuilt = await bare.pool.query<{ present: boolean }>(
        `select to_regclass('${bare.jobSchema}.version') is not null as present`,
      );
      expect(rebuilt.rows[0]?.present).toBe(false);
    } finally {
      await bare.dispose();
    }
  });

  it('names the queues it cannot work without a mail transport', async () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const worker = scratch.createJobWorker();
    try {
      await worker.start();
      const lines = logged.mock.calls.map((call) => String(call[0]));
      expect(lines.join('\n')).toContain(
        'invitation-delivery and sign-in-email',
      );
    } finally {
      await worker.stop();
      logged.mockRestore();
    }
  });

  it('says nothing about mail when a transport is configured', async () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const worker = scratch.createJobWorker({ mailer: silentMailer });
    try {
      await worker.start();
      expect(logged).not.toHaveBeenCalled();
    } finally {
      await worker.stop();
      logged.mockRestore();
    }
  });

  it('lets an in-flight job finish before stopping', async () => {
    const worker = scratch.createJobWorker({ mailer: silentMailer });
    await worker.start();

    let entered: number | undefined;
    let left: number | undefined;
    await worker.boss.work(
      'protocol-store-gc',
      { pollingIntervalSeconds: 0.5 },
      async () => {
        entered = Date.now();
        // Long enough that a stop which did not wait would return first, and
        // short enough to stay well inside the suite's timeout.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        left = Date.now();
      },
    );

    const jobId = await enqueueGc();
    await vi.waitFor(() => expect(entered).toBeDefined(), {
      timeout: 15_000,
      interval: 25,
    });

    const stopBegan = Date.now();
    await worker.stop();
    const stopReturned = Date.now();

    expect(left).toBeDefined();
    // A stop that abandoned the handler would return in milliseconds and
    // pg-boss would have failed the job with "shut down while active".
    expect(stopReturned - stopBegan).toBeGreaterThan(500);
    expect(stopReturned).toBeGreaterThanOrEqual(left!);
    expect(await jobState(jobId)).toBe('completed');
  });
});
