// The worker process's pg-boss: that it never installs or migrates a schema,
// which role it runs as, that a notify-enabled queue does not wait out a poll,
// and that SIGTERM lets an in-flight job finish.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import { settlesWithin } from '../../__tests__/support/timing.ts';
import type { StudioMailer } from '../../auth/email.ts';
import type { JobClient } from '../client.ts';

const db = await reachableDb();

/** Long enough for a graceful stop the scratch worker asks for (2 s). */
const STOP_BUDGET_MS = 10_000;

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

  const enqueueSignIn = async (): Promise<string> => {
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      const jobId = await jobs.enqueue(client, 'sign-in-email', {
        email: 'researcher@example.org',
        url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
      });
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
    let entered: number | undefined;
    let left: number | undefined;
    // The slowness goes in the transport rather than in a handler registered
    // beside the worker's own: a second `work()` on the same queue would race
    // the registered one for the job, and half the time the job would be
    // finished by the handler this case is not watching.
    const slowMailer: StudioMailer = {
      ...silentMailer,
      sendMagicLink: async () => {
        entered = Date.now();
        // Long enough that a stop which did not wait would return first, and
        // short enough to stay well inside the suite's timeout.
        await new Promise((resolve) => setTimeout(resolve, 1000));
        left = Date.now();
      },
    };
    const worker = scratch.createJobWorker({ mailer: slowMailer });
    await worker.start();

    const jobId = await enqueueSignIn();
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

  it('stops when pg-boss has already stopped', async () => {
    const worker = scratch.createJobWorker({ mailer: silentMailer });
    await worker.start();

    // Something else stopped the instance first: a second SIGTERM, a
    // supervisor, or a case that stopped the boss to make a point. pg-boss
    // returns from `stop()` without emitting `stopped` when it has nothing
    // left to shut down, so a shutdown that only waited for the event would
    // never return — and `dispose()` would hang behind it.
    await worker.boss.stop({ graceful: false });

    await settlesWithin(worker.stop(), STOP_BUDGET_MS, 'a repeated stop');
  });

  it('waits out a hung handler for the scratch window, not the deployed one', async () => {
    let entered = false;
    // The hang lives in the transport, not in a second handler on the queue:
    // the worker's own registration already works every queue, and a handler
    // registered beside it would race it for the job.
    const hungMailer: StudioMailer = {
      ...silentMailer,
      sendMagicLink: () => {
        entered = true;
        // Never settles: the handler a graceful stop has to give up on.
        return new Promise(() => undefined);
      },
    };
    const worker = scratch.createJobWorker({ mailer: hungMailer });
    await worker.start();

    await enqueueSignIn();
    await vi.waitFor(() => expect(entered).toBe(true), {
      timeout: 15_000,
      interval: 25,
    });

    const began = Date.now();
    await worker.stop();
    const elapsed = Date.now() - began;

    // It did wait — the graceful window is what lets a real handler finish...
    expect(elapsed).toBeGreaterThan(1000);
    // ...and the suites ask for a short one. Production's 25 seconds here
    // would spend most of a 30-second hook timeout on teardown, so a case that
    // failed with a job in flight would report the timeout instead.
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);

  it('runs pg-boss as the maintenance role', async () => {
    // Read from inside the statements pg-boss runs on its own pool, because
    // that is the session whose role is in question: the handler's own queries
    // go to the maintenance pool, which is pinned elsewhere. A job's fetch and
    // completion are both UPDATEs, so a trigger on the job table sees the role
    // pg-boss connected as.
    await scratch.pool.query(`
      create table ${scratch.jobSchema}.role_probe (who text not null);
      grant insert on ${scratch.jobSchema}.role_probe to ${TENANT_ROLES.maintenance};
      create function ${scratch.jobSchema}.record_role() returns trigger
        language plpgsql as $$
        begin
          insert into ${scratch.jobSchema}.role_probe (who) values (current_user);
          return null;
        end $$;
      create trigger record_role after update on ${scratch.jobSchema}.job_common
        for each row execute function ${scratch.jobSchema}.record_role();
    `);

    const worker = scratch.createJobWorker({ mailer: silentMailer });
    await worker.start();
    try {
      // Worked by the handler the worker registers for itself; any queue's
      // fetch and completion go through pg-boss's own pool, which is the
      // session under test.
      const jobId = await enqueueSignIn();
      await vi.waitFor(
        async () => expect(await jobState(jobId)).toBe('completed'),
        { timeout: 15_000, interval: 100 },
      );

      const roles = await scratch.pool.query<{ who: string }>(
        `select distinct who from ${scratch.jobSchema}.role_probe`,
      );
      // The login the URL carries is the schema's owner — a superuser in
      // development — so an unpinned worker would read as that instead.
      expect(roles.rows).toEqual([{ who: TENANT_ROLES.maintenance }]);
    } finally {
      await worker.stop();
      await scratch.pool.query(
        `drop trigger record_role on ${scratch.jobSchema}.job_common`,
      );
    }
  });

  it('is woken by a notification rather than its polling interval', async () => {
    let picked: number | undefined;
    // Thirty seconds is longer than this case is allowed to take, so a pickup
    // inside it can only have come from the NOTIFY the insert fires for a
    // notify-enabled queue — which is what a sign-in link, valid for minutes,
    // depends on. The cadence goes on the worker, whose own registration is
    // the only handler on the queue.
    const worker = scratch.createJobWorker({
      mailer: {
        ...silentMailer,
        sendMagicLink: () => {
          picked = Date.now();
          return Promise.resolve();
        },
      },
      workPollingIntervalSeconds: 30,
    });
    await worker.start();
    try {
      // Past whatever poll registering a worker performs for itself, so the
      // job below is created with no poll of its own coming.
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await enqueueSignIn();
      const queued = Date.now();

      await vi.waitFor(() => expect(picked).toBeDefined(), {
        timeout: 10_000,
        interval: 25,
      });
      expect(picked! - queued).toBeLessThan(2000);
    } finally {
      await worker.stop();
    }
  });
});
