// The worker's half of sign-in mail: a job on the queue becomes a send, a
// failed send is retried and then failed with nothing left behind, and a
// worker with no transport leaves the queue alone rather than failing the jobs
// on it. src/jobs/__tests__/sign-in-email.test.ts covers the web process's
// half — the transaction the job is created in.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { SignInEmailJob } from '@codaco/studio-sync/jobs';

import {
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
  type ScratchSchema,
} from '../../__tests__/support/postgres.ts';
import type { StudioMailer } from '../../auth/email.ts';
import type { JobClient } from '../client.ts';
import type { HandledJob } from '../handlers/job.ts';
import { createSignInEmailHandler } from '../handlers/sign-in-email.ts';

const db = await reachableDb();

const MAGIC_LINK: SignInEmailJob = {
  email: 'researcher@example.org',
  url: 'https://studio.example.org/api/auth/magic-link/verify?token=abc',
};

/** A transport that records what it was asked to send, and can refuse. */
function recordingMailer(sendMagicLink?: () => Promise<void>): {
  mailer: StudioMailer;
  sent: SignInEmailJob[];
} {
  const sent: SignInEmailJob[] = [];
  return {
    sent,
    mailer: {
      sendMagicLink: (input) => {
        sent.push(input);
        return sendMagicLink?.() ?? Promise.resolve();
      },
      sendTeamInvitation: () => Promise.resolve(),
    },
  };
}

type JobRow = {
  state: string;
  output: { message?: string } | null;
  dead_letter: string | null;
};

/** What pg-boss hands a handler, for the cases that are about the metadata. */
function fabricatedJob(overrides: Partial<HandledJob> = {}): HandledJob {
  return {
    id: 'a4f1c0de-0000-4000-8000-000000000001',
    data: MAGIC_LINK,
    retryCount: 0,
    retryLimit: 2,
    ...overrides,
  };
}

describe('the sign-in email handler, on one job', () => {
  function captureLines(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const record = (...args: unknown[]) => {
      lines.push(String(args[0]));
    };
    const log = vi.spyOn(console, 'log').mockImplementation(record);
    const error = vi.spyOn(console, 'error').mockImplementation(record);
    return {
      lines,
      restore: () => {
        log.mockRestore();
        error.mockRestore();
      },
    };
  }

  it('refuses a payload the queue would not have accepted', async () => {
    const { mailer, sent } = recordingMailer();
    const { lines, restore } = captureLines();
    try {
      await expect(
        createSignInEmailHandler({ mailer })([
          // A row written by an older release, or by hand: `enqueueJob`
          // validated on the way in, and nothing revalidates on the way out.
          fabricatedJob({ data: { email: 'researcher@example.org' } }),
        ]),
      ).rejects.toThrow();

      // Refused before the transport sees it, so a malformed address is never
      // handed to nodemailer.
      expect(sent).toEqual([]);
    } finally {
      restore();
    }
    expect(lines.join('\n')).toContain('sign-in-email');
  });

  it.each([
    { retryCount: 0, retryLimit: 2, outcome: 'retrying', attempt: 1 },
    { retryCount: 2, retryLimit: 2, outcome: 'failed', attempt: 3 },
  ])(
    'calls attempt $attempt of $retryLimit $outcome',
    async ({ retryCount, retryLimit, outcome, attempt }) => {
      const { mailer } = recordingMailer(() =>
        Promise.reject(new Error('SMTP refused the recipient')),
      );
      const { lines, restore } = captureLines();
      try {
        await expect(
          createSignInEmailHandler({ mailer })([
            fabricatedJob({ retryCount, retryLimit }),
          ]),
        ).rejects.toThrow();
      } finally {
        restore();
      }

      // The queue has no dead letter, so the line is the only record that the
      // last attempt was the last one.
      expect(lines).toEqual([
        `job sign-in-email ${fabricatedJob().id} ${outcome} (attempt ${attempt}): SMTP refused the recipient`,
      ]);
    },
  );
});

describe.skipIf(!db)('the sign-in email handler', () => {
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

  /**
   * The web process's path: a job created by the application role inside its
   * own transaction. `retryLimit` and `retryDelay` travel with the job rather
   * than through `updateQueue` so that a case about the last attempt does not
   * change the queue every other case in this file enqueues onto.
   */
  const enqueueSignIn = async (options?: {
    retryLimit?: number;
    retryDelay?: number;
  }): Promise<string> => {
    const client = await scratch.app.connect();
    try {
      await client.query('BEGIN');
      const jobId = await jobs.enqueue(
        client,
        'sign-in-email',
        MAGIC_LINK,
        options,
      );
      await client.query('COMMIT');
      return jobId;
    } finally {
      client.release();
    }
  };

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

  const jobRow = async (jobId: string): Promise<JobRow | undefined> => {
    const result = await scratch.pool.query<JobRow>(
      `select state, output, dead_letter from ${scratch.jobSchema}.job_common where id = $1`,
      [jobId],
    );
    return result.rows[0];
  };

  const jobsOnQueue = async (queue: string): Promise<number> => {
    const result = await scratch.pool.query<{ count: string }>(
      `select count(*) as count from ${scratch.jobSchema}.job_common where name = $1`,
      [queue],
    );
    return Number(result.rows[0]!.count);
  };

  it('sends the queued link exactly once and completes the job', async () => {
    const { mailer, sent } = recordingMailer();
    const worker = scratch.createJobWorker({ mailer });
    await worker.start();
    try {
      const jobId = await enqueueSignIn();
      await vi.waitFor(
        async () => expect((await jobRow(jobId))?.state).toBe('completed'),
        { timeout: 15_000, interval: 25 },
      );

      // The payload reaches the transport unchanged: the URL is the whole of
      // what better-auth minted and nothing here may rewrite it.
      expect(sent).toEqual([MAGIC_LINK]);
    } finally {
      await worker.stop();
    }
  });

  it('leaves a refused send in retry with the reason on the job', async () => {
    const refusal = new Error('SMTP refused the recipient');
    const { mailer, sent } = recordingMailer(() => Promise.reject(refusal));
    const worker = scratch.createJobWorker({ mailer });
    await worker.start();
    try {
      // Backoff far longer than this file's whole run, so the job is observed
      // between attempts rather than racing the next one — and so no later
      // case's worker inherits it.
      const jobId = await enqueueSignIn({ retryLimit: 2, retryDelay: 600 });
      await vi.waitFor(
        async () => expect((await jobRow(jobId))?.state).toBe('retry'),
        { timeout: 15_000, interval: 25 },
      );

      expect(sent).toEqual([MAGIC_LINK]);
      // Retained on the job, which is the only place an operator can read why
      // an attempt failed: the application role cannot see this column.
      expect((await jobRow(jobId))?.output?.message).toBe(refusal.message);
    } finally {
      await worker.stop();
    }
  });

  it('fails the last attempt and leaves no dead-letter copy', async () => {
    const { mailer, sent } = recordingMailer(() =>
      Promise.reject(new Error('SMTP refused the recipient')),
    );
    const errors: string[] = [];
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => errors.push(String(args[0])));
    const worker = scratch.createJobWorker({ mailer });
    await worker.start();
    try {
      const deadLetteredBefore = await jobsOnQueue(
        'invitation-delivery-dead-letter',
      );
      // retryLimit 0 makes the first attempt the last one, which is the state
      // the queue's own retryLimit reaches after three.
      const jobId = await enqueueSignIn({ retryLimit: 0 });
      await vi.waitFor(
        async () => expect((await jobRow(jobId))?.state).toBe('failed'),
        { timeout: 15_000, interval: 25 },
      );

      expect(sent).toHaveLength(1);
      // A sign-in link is useless by the time anyone could act on a
      // dead-lettered copy, so the queue names no dead letter and pg-boss has
      // nowhere to put one. Both halves are asserted: the job says it has no
      // destination, and the only dead-letter queue Studio declares is
      // untouched.
      expect((await jobRow(jobId))?.dead_letter).toBeNull();
      expect(await jobsOnQueue('invitation-delivery-dead-letter')).toBe(
        deadLetteredBefore,
      );
      // The registration asks pg-boss for the retry counters, which is the
      // only way the handler can tell this attempt was the last one — and the
      // line an operator reads is where that distinction lands.
      expect(errors).toContain(
        `job sign-in-email ${jobId} failed (attempt 1): SMTP refused the recipient`,
      );
    } finally {
      await worker.stop();
      logged.mockRestore();
    }
  });

  it('works no mail queue without a transport, and the rest of them anyway', async () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const worker = scratch.createJobWorker();
    await worker.start();
    try {
      const signInId = await enqueueSignIn();
      const gcId = await enqueueGc();

      // The sweep is the oracle for "the worker is running and fetching":
      // without it, a sign-in job still sitting in `created` would prove
      // nothing about why.
      await vi.waitFor(
        async () => expect((await jobRow(gcId))?.state).toBe('completed'),
        { timeout: 15_000, interval: 25 },
      );

      expect((await jobRow(signInId))?.state).toBe('created');
      expect(
        logged.mock.calls.map((call) => String(call[0])).join('\n'),
      ).toContain('invitation-delivery and sign-in-email');
    } finally {
      await worker.stop();
      logged.mockRestore();
      // Left in `created`, this job would be inherited by the next case's
      // worker, whose measurement is about how fast its own job arrives.
      await scratch.pool.query(
        `delete from ${scratch.jobSchema}.job_common where name = 'sign-in-email' and state = 'created'`,
      );
    }
  });

  it('is woken by the notify rather than by its poll', async () => {
    const { mailer } = recordingMailer();
    // Sixty times the interval the handler would otherwise poll at, so a
    // pickup inside a couple of seconds cannot have come from a poll.
    const worker = scratch.createJobWorker({
      mailer,
      workPollingIntervalSeconds: 30,
    });
    await worker.start();
    try {
      const enqueuedAt = Date.now();
      const jobId = await enqueueSignIn();
      await vi.waitFor(
        async () => expect((await jobRow(jobId))?.state).toBe('completed'),
        { timeout: 10_000, interval: 10 },
      );

      expect(Date.now() - enqueuedAt).toBeLessThan(2000);
    } finally {
      await worker.stop();
    }
  });
});
