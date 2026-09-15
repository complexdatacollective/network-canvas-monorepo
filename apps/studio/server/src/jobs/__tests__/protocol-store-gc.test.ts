// The protocol store's sweep as recurring work: the cron the worker registers,
// that two workers together still produce one run, and that the run is the
// real sweep rather than a handler that returns. src/protocol/__tests__/gc.test.ts
// covers what the sweep collects; this file covers everything between the cron
// and the call.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import type { JobClient } from '../client.ts';
import {
  createProtocolStoreGcHandler,
  PROTOCOL_STORE_GC_BOUNDS,
} from '../handlers/protocol-store-gc.ts';
import type { JobWorker } from '../worker.ts';

const db = await reachableDb();

const GC_SCHEDULE = JOB_SCHEDULES.find(
  (schedule) => schedule.queue === 'protocol-store-gc',
)!;

/** A minute-by-minute expression, so a test does not wait out an hour. */
const EVERY_MINUTE = '* * * * *';
const TEST_SCHEDULE_KEY = 'minute-boundary';

/** A schedule under a key no release declares: what a dropped one looks like. */
const RETIRED_SCHEDULE_KEY = 'retired-by-a-previous-release';

/**
 * Midnight on the first of January: a schedule that cannot come due inside
 * this file's run, so a row written to be reconciled away never creates a
 * sweep another case would count.
 */
const NEVER_THIS_RUN = '0 0 1 1 *';

/** pg-boss's own cron-forwarding queue, which it schedules against itself. */
const INTERNAL_QUEUE = '__pgboss__send-it';

const TEAM_ID = 'team-gc-cron';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits out the first minute of an hour. `0 * * * *` comes due inside it, so a
 * worker started there creates a sweep of its own — which would run before the
 * job a case enqueued and collect the rows it seeded, and would be a second
 * job in a count that expects one. One minute in sixty, and what is waited for
 * is that minute passing rather than a budget being spent.
 */
async function awayFromTheHourBoundary(): Promise<void> {
  while (new Date().getUTCMinutes() === 0) await sleep(250);
}

/**
 * The above, and a position inside the minute from which a short observation
 * window cannot span two occurrences of a per-minute schedule: pg-boss sends
 * what the last sixty seconds holds, so a window that crossed a boundary would
 * legitimately hold two jobs.
 */
async function alignToASafeWindow(): Promise<void> {
  for (;;) {
    await awayFromTheHourBoundary();
    const intoMinute = Date.now() % 60_000;
    if (intoMinute >= 3000 && intoMinute <= 40_000) return;
    await sleep(250);
  }
}

describe.skipIf(!db)('the protocol store sweep on the queue', () => {
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

  const twoWorkers = async (): Promise<JobWorker[]> => {
    const workers = [scratch.createJobWorker(), scratch.createJobWorker()];
    await Promise.all(workers.map((worker) => worker.start()));
    return workers;
  };

  const stopAll = (workers: JobWorker[]): Promise<void[]> =>
    Promise.all(workers.map((worker) => worker.stop()));

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
    const result = await scratch.pool.query<{ state: string }>(
      `select state from ${scratch.jobSchema}.job_common where id = $1`,
      [jobId],
    );
    return result.rows[0]?.state;
  };

  const scheduleRows = async (): Promise<{ name: string; key: string }[]> => {
    const result = await scratch.pool.query<{ name: string; key: string }>(
      `select name, key from ${scratch.jobSchema}.schedule order by name, key`,
    );
    return result.rows;
  };

  const gcJobCount = async (): Promise<number> => {
    const result = await scratch.pool.query<{ count: string }>(
      `select count(*) as count from ${scratch.jobSchema}.job_common where name = 'protocol-store-gc'`,
    );
    return Number(result.rows[0]!.count);
  };

  /** Whatever an earlier case left on the queue, so a count here means this case. */
  const clearGcQueue = (): Promise<unknown> =>
    scratch.pool.query(
      `delete from ${scratch.jobSchema}.job_common where name = 'protocol-store-gc'`,
    );

  it('sweeps to bounds no deployment can vary', () => {
    // The two windows are exercised below by rows that straddle them. The
    // manifest depth and the retry horizon are not — a thousand manifests is
    // too many to seed for what it would prove — so this is where they are
    // pinned, and the bounds are one object because the cron addresses the
    // sweep at nothing: there is no caller to pass a different set.
    expect(PROTOCOL_STORE_GC_BOUNDS).toEqual({
      retainManifestsPerDraft: 1000,
      sectionGraceMs: 259_200_000,
      commandRetryHorizonMs: 86_400_000,
    });
  });

  it('keeps a section for longer than a backup interval', () => {
    // Written as the arithmetic rather than as the constant: the number above
    // is three days because backups are daily (#1901), so a change that
    // shortened it would have to disagree with this sentence to pass (#1909).
    expect(PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs).toBe(72 * 60 * 60 * 1000);
    expect(PROTOCOL_STORE_GC_BOUNDS.sectionGraceMs).toBeGreaterThan(
      24 * 60 * 60 * 1000,
    );
  });

  it('registers the sweep once however many workers boot', async () => {
    const workers = await twoWorkers();
    try {
      const rows = await scratch.pool.query<{
        key: string;
        cron: string;
        timezone: string;
      }>(
        `select key, cron, timezone from ${scratch.jobSchema}.schedule
         where name = 'protocol-store-gc' and cron = $1`,
        [GC_SCHEDULE.cron],
      );

      // pg-boss upserts on (queue, key) and both workers register the same
      // key, so a second replica re-states the schedule rather than adding a
      // second one that would fire a second sweep every hour.
      expect(rows.rows).toEqual([
        { key: expect.any(String), cron: GC_SCHEDULE.cron, timezone: 'UTC' },
      ]);
    } finally {
      await stopAll(workers);
    }
  });

  it('drops a schedule this build no longer declares', async () => {
    // pg-boss's schedule table is state, not configuration: a schedule a
    // previous release wrote keeps coming due after JOB_SCHEDULES stops
    // declaring it, creating a job an hour on a queue nothing works. A worker
    // booting is the only moment anything reconciles the two. One worker is
    // enough for that: a second would write the same row.
    const running = scratch.createJobWorker();
    await running.start();
    try {
      await running.boss.schedule(
        'protocol-store-gc',
        NEVER_THIS_RUN,
        {},
        {
          tz: 'UTC',
          key: RETIRED_SCHEDULE_KEY,
        },
      );
      // pg-boss's own scheduling state, which a reconciliation that worked by
      // name alone would take with it. The row is written directly because
      // nothing of Studio's may schedule onto pg-boss's internal queue.
      await scratch.pool.query(
        `insert into ${scratch.jobSchema}.schedule (name, cron, timezone)
         values ($1, $2, 'UTC')`,
        [INTERNAL_QUEUE, NEVER_THIS_RUN],
      );
      expect(await scheduleRows()).toEqual([
        { name: INTERNAL_QUEUE, key: '' },
        { name: 'protocol-store-gc', key: '' },
        { name: 'protocol-store-gc', key: RETIRED_SCHEDULE_KEY },
      ]);

      const next = scratch.createJobWorker();
      await next.start();
      await next.stop();

      // The declared schedule stays, the retired one is gone, and pg-boss's
      // own row is not Studio's to remove.
      expect(await scheduleRows()).toEqual([
        { name: INTERNAL_QUEUE, key: '' },
        { name: 'protocol-store-gc', key: '' },
      ]);
    } finally {
      await running.stop();
      await scratch.pool.query(
        `delete from ${scratch.jobSchema}.schedule where name = $1`,
        [INTERNAL_QUEUE],
      );
    }
  });

  it('runs one sweep for one job across two workers, and it sweeps', async () => {
    // The seeded rows below are what this case reads the sweep's counts from,
    // so no other sweep may run first and collect them: not one an earlier
    // case left queued, and not one the deployment's own schedule creates.
    await clearGcQueue();
    await awayFromTheHourBoundary();

    // Collectable by the production bounds: unreferenced for longer than the
    // three-day grace, and referenced by no version, template or manifest.
    const collectable = `gc-${randomUUID()}`;
    // Inside the grace, so a client still editing against it can commit — and
    // so a daily backup has certainly captured it.
    const recent = `gc-${randomUUID()}`;
    await scratch.maintenance.query(
      `insert into sections (team_id, hash, doc, unreferenced_at)
       values ($1, $2, '{}'::jsonb, now() - interval '96 hours'),
              ($1, $3, '{}'::jsonb, now() - interval '48 hours')`,
      [TEAM_ID, collectable, recent],
    );

    const lines: string[] = [];
    const logged = vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(String(args[0]));
    });
    const workers = await twoWorkers();
    try {
      const jobId = await enqueueGc();
      await vi.waitFor(
        async () => expect(await jobState(jobId)).toBe('completed'),
        {
          timeout: 20_000,
          interval: 25,
        },
      );

      // pg-boss hands a job to one worker; the outcome line is how many times
      // a handler actually ran for it.
      const ran = lines.filter(
        (line) => line.includes(jobId) && line.includes('completed'),
      );
      expect(ran).toHaveLength(1);
      // Not an empty pass: the older row is gone, and the line the deployment
      // would read says so. One and not two, because the sweep's three-day
      // grace is what keeps the two-day-old row.
      expect(ran[0]).toContain('sections 1');
      const kept = await scratch.maintenance.query<{ hash: string }>(
        `select hash from sections where team_id = $1 order by hash`,
        [TEAM_ID],
      );
      expect(kept.rows).toEqual([{ hash: recent }]);
    } finally {
      await stopAll(workers);
      logged.mockRestore();
    }
    // Long enough to include waiting out the first minute of an hour.
  }, 90_000);

  it('creates one job for a minute boundary across two workers', async () => {
    await clearGcQueue();
    await alignToASafeWindow();

    const workers = await twoWorkers();
    try {
      // A test-only key beside the deployment's hourly one, because an
      // hourly expression only comes due in the first minute of an hour.
      // pg-boss's `missed: 'once'` is no shortcut here: its catch-up window
      // is bounded below by the schedule row's own `created_on`, so a
      // freshly written schedule owes nothing and sends nothing (measured:
      // no job in eight seconds from a fresh hourly schedule with it set).
      for (const worker of workers) {
        await worker.boss.schedule(
          'protocol-store-gc',
          EVERY_MINUTE,
          {},
          {
            tz: 'UTC',
            key: TEST_SCHEDULE_KEY,
          },
        );
      }

      await vi.waitFor(async () => expect(await gcJobCount()).toBe(1), {
        timeout: 20_000,
        interval: 100,
      });

      // Both workers keep running cron passes a second apart for the rest of
      // this window; a second job would mean the occurrence was sent twice.
      await sleep(6000);
      expect(await gcJobCount()).toBe(1);
    } finally {
      await stopAll(workers);
      await scratch.pool.query(
        `delete from ${scratch.jobSchema}.schedule where name = 'protocol-store-gc' and key = $1`,
        [TEST_SCHEDULE_KEY],
      );
    }
  }, 120_000); // minute boundary rather than slack. // Long enough to include the wait for a safe window, which is a real

  it('reports a sweep that could not run, and fails the job', async () => {
    const errors: string[] = [];
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => errors.push(String(args[0])));
    try {
      // The application pool rather than the maintenance one, which is the
      // shape of a misconfigured worker: `gcProtocolStore` refuses it rather
      // than reporting a clean pass over the tenants it could not see.
      const handler = createProtocolStoreGcHandler({
        maintenancePool: scratch.app,
      });
      const jobId = 'a4f1c0de-0000-4000-8000-000000000002';

      await expect(
        handler([{ id: jobId, data: {}, retryCount: 0, retryLimit: 0 }]),
      ).rejects.toThrow(/must run as studio_maintenance/);

      // At error level and terminal: the queue retries nothing, so this line
      // is the only notice a deployment gets that an hour was lost.
      expect(errors).toEqual([
        expect.stringContaining(`job protocol-store-gc ${jobId} failed`),
      ]);
    } finally {
      logged.mockRestore();
    }
  });

  it('never runs a second sweep while one is running', async () => {
    await clearGcQueue();

    // Both sends are accepted — the singleton policy is about running, not
    // about queueing, so neither `enqueueJob` call is refused.
    const first = await enqueueGc();
    const second = await enqueueGc();
    expect(second).not.toBe(first);
    expect(await jobState(first)).toBe('created');
    expect(await jobState(second)).toBe('created');

    // The first job is put in the state the policy keys on rather than being
    // run, because the real sweep of an empty store finishes in milliseconds
    // and would leave nothing for the second to be excluded from.
    await scratch.pool.query(
      `update ${scratch.jobSchema}.job_common
       set state = 'active', started_on = now() where id = $1`,
      [first],
    );

    const worker = scratch.createJobWorker();
    await worker.start();
    try {
      // Twelve polls and a dozen refreshes of the queue cache the exclusion is
      // read from: long enough that a queue without the policy would have
      // taken the second job several times over.
      await sleep(6000);
      expect(await jobState(second)).toBe('created');

      await scratch.pool.query(
        `update ${scratch.jobSchema}.job_common
         set state = 'completed', completed_on = now() where id = $1`,
        [first],
      );

      // And it is a wait rather than a refusal: the job runs as soon as the
      // one ahead of it is done.
      await vi.waitFor(
        async () => expect(await jobState(second)).toBe('completed'),
        { timeout: 20_000, interval: 50 },
      );
    } finally {
      await worker.stop();
    }
  });
});
